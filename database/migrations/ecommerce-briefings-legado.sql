-- Documentação — já existe em produção (não recriar, só documentar). Legado, sem token.
create table if not exists public.ecommerce_briefings (
  id         uuid primary key default gen_random_uuid(),
  numero     bigint generated always as identity,
  created_at timestamptz not null default now(),
  nome text, email text, whatsapp text, empresa text,
  raw        jsonb
);
alter table public.ecommerce_briefings enable row level security;
