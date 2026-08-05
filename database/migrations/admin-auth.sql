-- Fase 0 do admin unificado — aplicado em produção 2026-07-15
create table if not exists public.admin_sessions (
  token        text primary key default encode(extensions.gen_random_bytes(24), 'hex'),
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at   timestamptz not null default (now() + interval '12 hours')
);
alter table public.admin_sessions enable row level security;
-- sem policies: so a service-role (edge functions) acessa.
