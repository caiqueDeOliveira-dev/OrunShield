// Supabase Edge Function (Deno runtime).
// Deploy: supabase functions deploy delete-account
// Atende ao direito ao esquecimento da LGPD (art. 18, VI).
//
// REGRA DE NEGÓCIO IMPORTANTE que precisa de decisão do produto antes de ir
// pra produção: um usuário pode ser o único `owner` de um tenant
// organizacional (Beauty) com outros membros (staff/clientes) dependendo
// dele. Apagar a conta nesse caso não pode simplesmente cascatear e
// destruir o salão inteiro de outras pessoas.
//
// Esta implementação usa a política mais conservadora possível:
//   - Tenant type = 'personal' (Desktop/Mobile/TV/Shields): cascade delete completo.
//   - Tenant type = 'organization' (Beauty) onde o usuário é o único owner:
//     BLOQUEIA a exclusão e retorna 409 pedindo transferência de
//     titularidade primeiro. Isso é uma escolha de produto, não uma
//     limitação técnica — revisar com o Caique antes do Beauty ter usuários reais.

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

  const { data: memberships } = await adminClient
    .from('memberships')
    .select('tenant_id, role, tenants(type)')
    .eq('user_id', userId);

  const blockedTenants: string[] = [];

  for (const m of memberships ?? []) {
    const tenant = m.tenants as unknown as { type: string };
    if (tenant?.type !== 'organization' || m.role !== 'owner') continue;

    const { count } = await adminClient
      .from('memberships')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', m.tenant_id)
      .eq('role', 'owner');

    if ((count ?? 0) <= 1) blockedTenants.push(m.tenant_id);
  }

  if (blockedTenants.length > 0) {
    return new Response(
      JSON.stringify({
        error: 'sole_owner_of_organization',
        message:
          'Você é o único proprietário de uma organização com outros membros. Transfira a titularidade antes de excluir sua conta.',
        blockedTenants,
      }),
      { status: 409, headers: { 'Content-Type': 'application/json' } }
    );
  }

  await adminClient.from('audit_log').insert({
    user_id: userId,
    event_type: 'account_deletion_requested',
    metadata: { requested_at: new Date().toISOString() },
  });

  // auth.admin.deleteUser cascateia via FK on delete cascade nas tabelas
  // que referenciam users(id) — confirmar que TODAS as FKs relevantes têm
  // on delete cascade antes de depender só disso (ver orun-identity-schema.md).
  const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId);
  if (deleteError) {
    return new Response(JSON.stringify({ error: deleteError.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ deleted: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
