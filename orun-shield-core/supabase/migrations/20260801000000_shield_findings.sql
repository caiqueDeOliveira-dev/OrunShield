-- Migration: shield_findings
-- Persiste os ThreatFinding do Orun Shield para sincronização entre
-- devices (desktop <-> mobile) via @orun/supabase-sync, seguindo o mesmo
-- padrão outbox/FK-ordered push já usado nas outras entidades do Orun OS.
--
-- Decisão de escopo: por padrão, só findings de severidade "high" ou
-- "critical" deveriam ser sincronizados (ver nota no README de integração)
-- para não estourar volume — mas a tabela aceita qualquer severidade,
-- a filtragem fica na camada de sync do app.

create table if not exists public.shield_findings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id text not null, -- identifica de qual device/instalação veio (desktop principal, notebook, etc)

  -- Campos espelhando 1:1 o schema ThreatFinding do @orun/shield-core (ver src/types.ts)
  source text not null check (source in (
    'clamav', 'virustotal', 'yara',
    'sentinel-process', 'sentinel-network', 'sentinel-fs',
    'integrity'
  )),
  severity text not null check (severity in ('info', 'low', 'medium', 'high', 'critical')),
  title text not null,
  description text not null,
  file_path text,
  process_name text,
  pid integer,
  remote_address text,
  sha256 text,
  rule_name text,
  detected_at timestamptz not null,

  -- Metadados de resposta/ação tomada — não existe no ThreatFinding original,
  -- é específico da camada de sync/histórico.
  status text not null default 'open' check (status in ('open', 'dismissed', 'quarantined', 'restored', 'deleted')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.shield_findings is
  'Histórico sincronizado de achados de segurança do Orun Shield entre devices. Fonte de verdade local é o SQLite de cada device (outbox pattern); esta tabela é o destino da sincronização.';

-- Índices para as queries mais comuns: listar por usuário/device, filtrar por severidade/status.
create index if not exists idx_shield_findings_user_id on public.shield_findings(user_id);
create index if not exists idx_shield_findings_device_id on public.shield_findings(device_id);
create index if not exists idx_shield_findings_severity on public.shield_findings(severity);
create index if not exists idx_shield_findings_status on public.shield_findings(status);
create index if not exists idx_shield_findings_detected_at on public.shield_findings(detected_at desc);

-- updated_at automático a cada mudança (mesmo padrão de trigger que vocês já usam nas outras tabelas).
create or replace function public.set_shield_findings_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_shield_findings_updated_at on public.shield_findings;
create trigger trg_shield_findings_updated_at
  before update on public.shield_findings
  for each row
  execute function public.set_shield_findings_updated_at();

-- Row Level Security: cada usuário só vê/edita os próprios findings.
-- Dados de segurança do dispositivo (processos, IPs, caminhos de arquivo)
-- são sensíveis — RLS restrita é essencial aqui, mais até do que em outras
-- tabelas do ecossistema.
alter table public.shield_findings enable row level security;

create policy "shield_findings_select_own"
  on public.shield_findings for select
  using (auth.uid() = user_id);

create policy "shield_findings_insert_own"
  on public.shield_findings for insert
  with check (auth.uid() = user_id);

create policy "shield_findings_update_own"
  on public.shield_findings for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "shield_findings_delete_own"
  on public.shield_findings for delete
  using (auth.uid() = user_id);

-- Realtime: permite que outros devices do mesmo usuário recebam novos
-- findings críticos ao vivo (ex: alerta que apareceu no desktop também
-- notifica o celular), seguindo o mesmo padrão Realtime já usado no
-- dashboard admin do OrunTV.
alter publication supabase_realtime add table public.shield_findings;
