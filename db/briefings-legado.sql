-- Documentação — já existe em produção (não recriar, só documentar). Legado, sem token.
create sequence if not exists public.briefings_numero_seq;
create table if not exists public.briefings (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  nome text, email text, whatsapp text,
  q1 text, q2 text, q3 text, q4 text, q5 text, q6 text, q7 text, q8 text, q9 text,
  q10_descricao text, q10_link text,
  q11_cores text, q11_texto text,
  q12 text, q13 text, q14 text, q15 text, q16 text, q17 text,
  q18 text, q18_outro text,
  raw           jsonb,
  numero        integer default nextval('briefings_numero_seq')
);
alter table public.briefings enable row level security;
