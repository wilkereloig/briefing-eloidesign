-- db/eloi-financeiro.sql
-- Fase 5: caixas + movimentações financeiras (entradas/saídas, previsto/realizado).
-- Valores sempre em cents. Aditivo e idempotente. RLS ligado sem policy pública:
-- só a service role (edge functions com token de admin) lê/escreve.

create table if not exists public.eloi_caixas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  tipo text not null default 'outro'
    check (tipo in ('caixa','conta_bancaria','carteira','cartao','outro')),
  saldo_inicial_cents bigint not null default 0,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.eloi_caixas enable row level security;

create table if not exists public.eloi_movimentos_financeiros (
  id uuid primary key default gen_random_uuid(),
  caixa_id uuid not null references public.eloi_caixas(id),
  cliente_id uuid references public.eloi_clientes(id),
  servico_id uuid references public.eloi_servicos(id),
  orcamento_id uuid references public.orcamentos(id),
  tipo text not null check (tipo in ('entrada','saida')),
  status text not null default 'realizado'
    check (status in ('previsto','realizado','cancelado')),
  descricao text not null,
  valor_cents bigint not null check (valor_cents > 0),
  data_competencia date,
  data_movimento date,
  forma_pagamento text,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.eloi_movimentos_financeiros enable row level security;

create index if not exists eloi_mov_fin_caixa_idx on public.eloi_movimentos_financeiros(caixa_id);
create index if not exists eloi_mov_fin_cliente_idx on public.eloi_movimentos_financeiros(cliente_id);
create index if not exists eloi_mov_fin_servico_idx on public.eloi_movimentos_financeiros(servico_id);
