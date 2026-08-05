-- Documentação — já existe em produção (não recriar, só documentar)
create sequence if not exists public.orcamentos_numero_seq;
create table if not exists public.orcamentos (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  cliente      text,
  cliente_id   uuid references public.eloi_clientes(id), -- adicionado no addendum de área de cliente
  titulo       text,
  status       text default 'rascunho',
  itens        jsonb default '[]'::jsonb,
  valor_total  numeric default 0,
  observacoes  text,
  link         text,
  share_token  uuid not null default gen_random_uuid(),
  numero       integer default nextval('orcamentos_numero_seq')
);
alter table public.orcamentos enable row level security;
create index if not exists orcamentos_cliente_id_idx on public.orcamentos(cliente_id);
