// Supabase Edge Function (Deno runtime).
// Deploy: supabase functions deploy issue-license
// Requer LICENSE_PRIVATE_KEY_PEM como secret (chave privada RSA, PKCS8 PEM) —
// gerar uma vez com:
//   openssl genrsa -out license_private.pem 2048
//   openssl pkcs8 -topk8 -nocrypt -in license_private.pem -out license_private_pkcs8.pem
//   openssl rsa -in license_private.pem -pubout -out license_public.pem
//
// A chave pública (license_public.pem) NÃO é secreta — vai embutida no
// bundle de cada app (Desktop/TV) via LicenseManagerConfig.publicKeyPem.
// Só a privada fica aqui, como secret da function.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { SignJWT, importPKCS8 } from 'https://esm.sh/jose@5?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const LICENSE_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 dias — bate com o grace period padrão do LicenseManager

serve(async (req) => {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return new Response('Missing auth', { status: 401 });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return new Response('Unauthorized', { status: 401 });

  const { tenantId, deviceId } = await req.json();

  // Confirma que o usuário pertence ao tenant e que o device está registrado
  // e não revogado — nunca emitir licença sem checar os dois.
  const [{ data: membership }, { data: device }] = await Promise.all([
    supabase
      .from('memberships')
      .select('role')
      .eq('user_id', userData.user.id)
      .eq('tenant_id', tenantId)
      .maybeSingle(),
    supabase
      .from('user_devices')
      .select('id, revoked_at')
      .eq('id', deviceId)
      .eq('tenant_id', tenantId)
      .maybeSingle(),
  ]);

  if (!membership) return new Response('Forbidden: not a member of tenant', { status: 403 });
  if (!device || device.revoked_at) return new Response('Forbidden: device not registered or revoked', { status: 403 });

  // Resolve plano + entitlements ativos do tenant (mesma lógica do EntitlementsResolver, server-side).
  const { data: subRow } = await supabase
    .from('subscriptions')
    .select('*, plans(*)')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const isActive = subRow && ['active', 'trialing'].includes(subRow.status);
  const planKey = isActive ? subRow.plans.key : 'free';

  let features: Record<string, unknown> = {};
  if (isActive) {
    const { data: entRows } = await supabase
      .from('entitlements')
      .select('feature_key, value')
      .eq('plan_id', subRow.plan_id);
    features = Object.fromEntries((entRows ?? []).map((r) => [r.feature_key, r.value]));
  }

  const privateKeyPem = Deno.env.get('LICENSE_PRIVATE_KEY_PEM')!;
  const privateKey = await importPKCS8(privateKeyPem, 'RS256');

  const token = await new SignJWT({ tenantId, deviceId, planKey, features })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + LICENSE_TTL_SECONDS)
    .sign(privateKey);

  return new Response(JSON.stringify({ token }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
