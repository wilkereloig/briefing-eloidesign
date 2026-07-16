-- Documentação — já existe em produção (não recriar, só documentar). 0 linhas hoje, catálogo vazio.
create table if not exists public.catalogo_servicos (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  categoria   text,
  preco_base  numeric not null default 0,
  unidade     text not null default 'un',
  ativo       boolean not null default true,
  ordem       integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.catalogo_servicos enable row level security;
