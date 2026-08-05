-- Gestão ELOI — núcleo financeiro (pessoal + empresa) em schema próprio.
-- Decisão: NÃO reusar transactions/cards/categories/recurrences/budgets do app
-- Financeiro (mesmo projeto Supabase). Aquele produto continua dono daquelas
-- tabelas; aqui tudo vive sob o prefixo eloi_. Ver CLAUDE.md.
--
-- Regras que o schema garante (e que o front NÃO pode recalcular diferente):
--  1. Dinheiro é SEMPRE inteiro em cents. Exceção herdada: orcamentos.valor_total
--     é numeric em reais — não replicar esse erro aqui.
--  2. Transferência é UMA linha com conta_origem_id + conta_destino_id. Nunca
--     duas linhas espelhadas: dupla contagem em receita/despesa é o bug clássico
--     desse tipo de sistema.
--  3. Todo movimento declara contexto: pessoal | empresa. Movimento entre os dois
--     contextos (pró-labore, aporte, reembolso) é transferência, não receita.
--  4. Parcelamento não cria tabela: as parcelas são transações irmãs ligadas por
--     grupo_id, cada uma com seu vencimento. Uma parcela é uma obrigação real.

-- ── enums ────────────────────────────────────────────────────────────────────
do $$ begin
  create type eloi_contexto as enum ('pessoal','empresa');
exception when duplicate_object then null; end $$;

do $$ begin
  -- entrada/saida movem dinheiro pra dentro/fora do patrimônio;
  -- transferencia só troca de bolso e é neutra no resultado.
  create type eloi_tipo_mov as enum ('entrada','saida','transferencia');
exception when duplicate_object then null; end $$;

do $$ begin
  create type eloi_status_mov as enum ('previsto','pendente','parcial','realizado','vencido','cancelado');
exception when duplicate_object then null; end $$;

do $$ begin
  create type eloi_tipo_conta as enum ('corrente','poupanca','digital','dinheiro','cartao_credito','investimento','reserva','outro');
exception when duplicate_object then null; end $$;

do $$ begin
  create type eloi_status_nf as enum ('pendente','pronta','emitida','enviada','cancelada','substituida');
exception when duplicate_object then null; end $$;

-- ── contas e carteiras ───────────────────────────────────────────────────────
create table if not exists eloi_contas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  tipo eloi_tipo_conta not null default 'corrente',
  contexto eloi_contexto not null,
  instituicao text,
  cor text,
  saldo_inicial_cents bigint not null default 0,
  -- cartão de crédito: limite e datas do ciclo. Nulos nos demais tipos.
  limite_cents bigint,
  dia_fechamento smallint check (dia_fechamento between 1 and 31),
  dia_vencimento smallint check (dia_vencimento between 1 and 31),
  ativa boolean not null default true,
  created_at timestamptz not null default now(),
  -- cartão sem ciclo definido não consegue montar fatura: barra na origem
  constraint cartao_tem_ciclo check (
    tipo <> 'cartao_credito' or (dia_fechamento is not null and dia_vencimento is not null)
  )
);

-- ── categorias ───────────────────────────────────────────────────────────────
create table if not exists eloi_categorias (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  contexto eloi_contexto not null,
  tipo eloi_tipo_mov not null default 'saida',
  pai_id uuid references eloi_categorias(id) on delete set null,
  cor text,
  icone text,
  ativa boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists idx_eloi_categorias_ctx on eloi_categorias(contexto, tipo) where ativa;

-- ── transações ───────────────────────────────────────────────────────────────
-- Peça central. Receita, despesa, transferência, parcela e fatura de cartão são
-- todas linhas daqui — o que muda é tipo/contexto/vínculo, não a estrutura.
create table if not exists eloi_transacoes (
  id uuid primary key default gen_random_uuid(),
  tipo eloi_tipo_mov not null,
  contexto eloi_contexto not null,
  status eloi_status_mov not null default 'previsto',
  descricao text not null,
  valor_cents bigint not null check (valor_cents > 0),
  -- quanto já entrou/saiu de fato. Pagamento parcial é primeira classe.
  recebido_cents bigint not null default 0 check (recebido_cents >= 0),

  conta_id uuid references eloi_contas(id) on delete restrict,
  conta_destino_id uuid references eloi_contas(id) on delete restrict,
  categoria_id uuid references eloi_categorias(id) on delete set null,

  cliente_id uuid references eloi_clientes(id) on delete set null,
  servico_id uuid references eloi_servicos(id) on delete set null,
  fornecedor text,

  -- competência = mês a que o valor pertence (regime de competência);
  -- vencimento = quando é devido; liquidacao = quando o dinheiro andou (caixa).
  data_competencia date,
  data_vencimento date,
  data_liquidacao date,
  forma_pagamento text,

  -- parcelas irmãs compartilham grupo_id; 3/12 vira parcela_num=3, parcela_de=12
  grupo_id uuid,
  parcela_num smallint,
  parcela_de smallint,
  recorrencia_id uuid,

  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- transferência exige os dois lados e não aceita categoria de resultado
  constraint transferencia_tem_dois_lados check (
    tipo <> 'transferencia' or (conta_id is not null and conta_destino_id is not null and conta_id <> conta_destino_id)
  ),
  constraint entrada_saida_tem_conta check (tipo = 'transferencia' or conta_id is not null),
  constraint recebido_nao_passa_do_total check (recebido_cents <= valor_cents),
  constraint parcela_coerente check (
    (parcela_num is null and parcela_de is null)
    or (parcela_num between 1 and parcela_de)
  )
);
create index if not exists idx_eloi_tx_competencia on eloi_transacoes(contexto, data_competencia);
create index if not exists idx_eloi_tx_vencimento on eloi_transacoes(status, data_vencimento)
  where status in ('previsto','pendente','parcial','vencido');
create index if not exists idx_eloi_tx_cliente on eloi_transacoes(cliente_id) where cliente_id is not null;
create index if not exists idx_eloi_tx_grupo on eloi_transacoes(grupo_id) where grupo_id is not null;

-- ── recorrências ─────────────────────────────────────────────────────────────
-- Molde que gera transações. Pausar/encerrar não apaga o que já foi gerado.
create table if not exists eloi_recorrencias (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  tipo eloi_tipo_mov not null default 'saida',
  contexto eloi_contexto not null,
  valor_cents bigint not null check (valor_cents > 0),
  periodicidade text not null default 'mensal'
    check (periodicidade in ('semanal','quinzenal','mensal','bimestral','trimestral','semestral','anual')),
  dia_cobranca smallint check (dia_cobranca between 1 and 31),
  conta_id uuid references eloi_contas(id) on delete set null,
  categoria_id uuid references eloi_categorias(id) on delete set null,
  fornecedor text,
  inicio date not null default current_date,
  fim date,
  proxima_cobranca date,
  ativa boolean not null default true,
  pausada_em timestamptz,
  encerrada_em timestamptz,
  observacoes text,
  created_at timestamptz not null default now()
);

alter table eloi_transacoes
  drop constraint if exists eloi_transacoes_recorrencia_fk;
alter table eloi_transacoes
  add constraint eloi_transacoes_recorrencia_fk
  foreign key (recorrencia_id) references eloi_recorrencias(id) on delete set null;

-- ── notas fiscais ────────────────────────────────────────────────────────────
create table if not exists eloi_notas_fiscais (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid references eloi_clientes(id) on delete set null,
  servico_id uuid references eloi_servicos(id) on delete set null,
  transacao_id uuid references eloi_transacoes(id) on delete set null,
  numero text,
  status eloi_status_nf not null default 'pendente',
  valor_cents bigint not null check (valor_cents >= 0),
  imposto_cents bigint not null default 0 check (imposto_cents >= 0),
  competencia date,
  emitida_em date,
  enviada_em date,
  arquivo_path text,
  observacoes text,
  created_at timestamptz not null default now()
);
create index if not exists idx_eloi_nf_status on eloi_notas_fiscais(status, competencia);

-- ── metas e orçamentos de gasto ──────────────────────────────────────────────
-- Uma tabela para os dois: 'orcamento' limita gasto por categoria no período,
-- 'meta' acumula em direção a um alvo. Estrutura idêntica, leitura diferente.
create table if not exists eloi_metas (
  id uuid primary key default gen_random_uuid(),
  especie text not null default 'meta' check (especie in ('meta','orcamento')),
  nome text not null,
  contexto eloi_contexto not null,
  categoria_id uuid references eloi_categorias(id) on delete cascade,
  conta_id uuid references eloi_contas(id) on delete cascade,
  alvo_cents bigint not null check (alvo_cents > 0),
  inicio date not null,
  fim date,
  ativa boolean not null default true,
  created_at timestamptz not null default now(),
  constraint orcamento_tem_recorte check (
    especie <> 'orcamento' or categoria_id is not null or conta_id is not null
  )
);

-- ── arquivos ─────────────────────────────────────────────────────────────────
-- Anexo genérico: aponta pra UMA entidade. Sem tabela ponte por tipo.
create table if not exists eloi_arquivos (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  path text not null,
  mime text,
  tamanho_bytes bigint,
  categoria text not null default 'outro'
    check (categoria in ('contrato','proposta','nota_fiscal','comprovante','boleto','documento','relatorio','outro')),
  cliente_id uuid references eloi_clientes(id) on delete cascade,
  servico_id uuid references eloi_servicos(id) on delete cascade,
  transacao_id uuid references eloi_transacoes(id) on delete cascade,
  nota_fiscal_id uuid references eloi_notas_fiscais(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint arquivo_tem_dono check (
    num_nonnulls(cliente_id, servico_id, transacao_id, nota_fiscal_id) >= 1
  )
);

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Mesmo padrão das demais eloi_*: nenhum acesso pelo client anon. Todo acesso
-- passa pelas edge functions com service_role, atrás do token de admin_sessions.
do $$
declare t text;
begin
  foreach t in array array['eloi_contas','eloi_categorias','eloi_transacoes',
    'eloi_recorrencias','eloi_notas_fiscais','eloi_metas','eloi_arquivos']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists sem_acesso_anon on %I', t);
    execute format('create policy sem_acesso_anon on %I for all to anon, authenticated using (false) with check (false)', t);
  end loop;
end $$;
