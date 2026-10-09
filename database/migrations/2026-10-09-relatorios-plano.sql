-- Relatórios gerados sob pedido (hoje: plano de pagamentos dia a dia).
-- O dono pede "gera o plano"; o assistente calcula a partir dos dados do banco
-- e grava um retrato aqui. A tela /admin/dinheiro/plano mostra o mais recente.
-- É retrato, não cálculo ao vivo: o plano carrega decisões (pagar só o mínimo,
-- adiar uma conta) que não existem nos lançamentos.
-- Puramente aditiva: não toca tabela existente.
create table if not exists public.eloi_relatorios (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('plano_pagamento')),
  contexto eloi_contexto not null,
  titulo text not null check (length(trim(titulo)) > 0),
  -- Formato validado na leitura por app/src/domain/plano.ts (lerPlano).
  dados jsonb not null check (jsonb_typeof(dados) = 'object'),
  gerado_em timestamptz not null default now()
);
alter table public.eloi_relatorios enable row level security;
-- sem policy: anon/authenticated negados; edge usa service_role
create index if not exists eloi_relatorios_ultimo_idx
  on public.eloi_relatorios (tipo, contexto, gerado_em desc);
comment on table public.eloi_relatorios is
  'Relatórios gerados sob pedido (ELOI). dados = retrato em cents; ver domain/plano.ts.';
