-- Origem da transação e conferência de saldo.
--
-- ORIGEM: hoje uma linha em eloi_transacoes não diz de onde veio. Recorrência
-- e parcelamento se deduzem por recorrencia_id/grupo_id; importação e ajuste
-- de conferência não teriam como se identificar. "Importado" precisa ficar
-- rastreável (spec §22) e ajuste de saldo precisa ser explícito (§21) — um
-- ajuste disfarçado de despesa comum é o que faz o resultado mentir.
--
-- CONFERÊNCIA: saldo do sistema vs saldo informado pelo extrato, numa data.
-- Registro histórico, não correção: a diferença fica gravada e o ajuste, se
-- houver, é uma transação separada e identificada. Nunca se altera lançamento
-- para "bater".

alter table public.eloi_transacoes
  add column if not exists origem text not null default 'manual';

alter table public.eloi_transacoes
  drop constraint if exists eloi_transacoes_origem_check;
alter table public.eloi_transacoes
  add constraint eloi_transacoes_origem_check
  check (origem in ('manual', 'recorrencia', 'parcelamento', 'importacao', 'ajuste'));

-- Backfill do que já se sabe pelas colunas existentes.
update public.eloi_transacoes set origem = 'recorrencia'
  where recorrencia_id is not null and origem = 'manual';
update public.eloi_transacoes set origem = 'parcelamento'
  where grupo_id is not null and recorrencia_id is null and origem = 'manual';

-- Chave de importação: (data|valor|descrição normalizada) calculada no cliente.
-- O índice único por conta torna reimportar o mesmo extrato idempotente no
-- banco, não só na tela.
alter table public.eloi_transacoes
  add column if not exists importacao_chave text;
create unique index if not exists eloi_transacoes_importacao_unica
  on public.eloi_transacoes (conta_id, importacao_chave)
  where importacao_chave is not null;

comment on column public.eloi_transacoes.origem is
  'manual | recorrencia | parcelamento | importacao | ajuste. Ajuste = criado por conferência de saldo; nunca se edita lançamento para bater saldo.';
comment on column public.eloi_transacoes.importacao_chave is
  'data|valor|descrição normalizada, calculada na importação. Única por conta: reimportar o mesmo extrato não duplica.';

create table if not exists public.eloi_conferencias (
  id                    uuid primary key default gen_random_uuid(),
  conta_id              uuid not null references public.eloi_contas(id) on delete cascade,
  data                  date not null,
  saldo_informado_cents bigint not null,
  saldo_sistema_cents   bigint not null,
  -- informado - sistema. Positivo = tem dinheiro que o painel não conhece.
  diferenca_cents       bigint not null,
  observacoes           text,
  -- Preenchido só se o dono criou ajuste explícito a partir desta conferência.
  ajuste_transacao_id   uuid references public.eloi_transacoes(id) on delete set null,
  created_at            timestamptz not null default now()
);

create index if not exists eloi_conferencias_conta_idx
  on public.eloi_conferencias (conta_id, data desc);

alter table public.eloi_conferencias enable row level security;
drop policy if exists sem_acesso_anon on public.eloi_conferencias;
create policy sem_acesso_anon on public.eloi_conferencias
  for all to anon, authenticated using (false) with check (false);

comment on table public.eloi_conferencias is
  'Conferência de saldo: sistema vs extrato numa data. Histórico, não correção. Ajuste é transação separada com origem=ajuste.';
