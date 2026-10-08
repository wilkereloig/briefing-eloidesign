-- Empréstimos: cadastro próprio; parcelas são eloi_transacoes com emprestimo_id.
-- Spec: docs/superpowers/specs/2026-10-08-financeiro-completo-design.md
create table public.eloi_emprestimos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  instituicao text,
  contexto eloi_contexto not null,
  conta_id uuid references public.eloi_contas(id),
  categoria_id uuid references public.eloi_categorias(id),
  valor_recebido_cents bigint not null default 0 check (valor_recebido_cents >= 0),
  parcelas_total smallint not null check (parcelas_total >= 1),
  valor_parcela_cents bigint not null check (valor_parcela_cents > 0),
  primeiro_vencimento date not null,
  parcelas_pagas_antes smallint not null default 0 check (parcelas_pagas_antes >= 0 and parcelas_pagas_antes <= parcelas_total),
  ativo boolean not null default true,
  observacoes text,
  created_at timestamptz not null default now()
);
alter table public.eloi_emprestimos enable row level security;
-- sem policy: anon/authenticated negados; edge usa service_role
alter table public.eloi_transacoes add column emprestimo_id uuid references public.eloi_emprestimos(id);
create index eloi_transacoes_emprestimo_idx on public.eloi_transacoes(emprestimo_id) where emprestimo_id is not null;
comment on table public.eloi_emprestimos is 'Empréstimos (ELOI). Parcelas são eloi_transacoes com emprestimo_id.';
