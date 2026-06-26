-- Painel de Gestão ELOI — Fase 1 (tabelas isoladas + bucket de notas)
create table if not exists public.eloi_clientes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cor text not null default '#7B2CBF',
  contato text,
  created_at timestamptz not null default now()
);

create table if not exists public.eloi_servicos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.eloi_clientes(id) on delete restrict,
  descricao text not null,
  valor_cents bigint not null default 0,
  status_execucao text not null default 'em_execucao'
    check (status_execucao in ('em_execucao','concluida')),
  pago boolean not null default false,
  data_pagamento date,
  nf_numero text,
  nf_arquivo_url text,
  observacoes text,
  created_at timestamptz not null default now()
);

create index if not exists eloi_servicos_cliente_idx on public.eloi_servicos(cliente_id);

alter table public.eloi_clientes enable row level security;
alter table public.eloi_servicos enable row level security;
-- Sem políticas para anon/authenticated: acesso só via edge (service-role bypassa RLS).

-- Bucket privado para PDFs de nota fiscal (aplicar via execute_sql, fora da migration):
-- insert into storage.buckets (id, name, public) values ('eloi-notas','eloi-notas', false)
-- on conflict (id) do nothing;
