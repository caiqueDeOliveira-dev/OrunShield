// Supabase Edge Function (Deno runtime).
// Deploy: supabase functions deploy export-user-data
// Só precisa da SUPABASE_SERVICE_ROLE_KEY como secret — usa o JWT do
// usuário pra identificar quem está pedindo, e service_role pra juntar
// dados de todas as tabelas relacionadas sem depender de RLS por tabela.
//
// Atende ao direito de portabilidade de dados da LGPD (art. 18, V) —
// entrega tudo que o Orun tem sobre o usuário num único JSON.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const anonClient = (authHeader: string) =>
  createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });

const adminClient = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

serve(async (req) => {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return new Response('Missing auth', { status: 401 });

  const { data: userData, error: userError } = await anonClient(authHeader).auth.getUser();
  if (userError || !userData.user) return new Response('Unauthorized', { status: 401 });

  const userId = userData.user.id;

  const [profile, membershipsResult, devicesResult, subscriptionsResult, auditLog] = await Promise.all([
    adminClient.from('users').select('*').eq('id', userId).single(),
    adminClient.from('memberships').select('*, tenants(*)').eq('user_id', userId),
    adminClient.from('user_devices').select('*').eq('user_id', userId),
    adminClient
      .from('memberships')
      .select('tenant_id')
      .eq('user_id', userId)
      .then(async ({ data: memberships }) => {
        const tenantIds = (memberships ?? []).map((m) => m.tenant_id);
        if (tenantIds.length === 0) return { data: [] as unknown[] };
        return adminClient.from('subscriptions').select('*').in('tenant_id', tenantIds);
      }),
    adminClient.from('audit_log').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
  ]);

  const deviceIds = (devicesResult.data ?? []).map((d: { id: string }) => d.id);
  const sessions =
    deviceIds.length > 0
      ? await adminClient
          .from('sessions')
          .select('id, device_id, issued_at, expires_at, revoked_at')
          .in('device_id', deviceIds)
      : { data: [] as unknown[] };

  const exportPayload = {
    exported_at: new Date().toISOString(),
    profile: profile.data,
    memberships: membershipsResult.data,
    devices: devicesResult.data,
    active_sessions_metadata: sessions.data, // metadados apenas — nunca inclui o token em si
    subscriptions: subscriptionsResult.data,
    audit_log: auditLog.data,
  };

  return new Response(JSON.stringify(exportPayload, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': 'attachment; filename="orun-meus-dados.json"',
    },
  });
});
