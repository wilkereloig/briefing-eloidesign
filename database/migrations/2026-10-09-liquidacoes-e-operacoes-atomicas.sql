-- 2026-10-09 · Liquidações próprias, operações atômicas e trilha de auditoria.
--
-- Etapas 2 e 3 do plano de evolução (docs/EVOLUCAO-FINANCEIRO.md). Tudo é
-- ADITIVO: nenhuma coluna existente muda de significado, nenhum id muda.
--
--  1. eloi_liquidacoes — cada pagamento/recebimento vira um registro com data,
--     conta, forma, origem e chave de idempotência. eloi_transacoes.recebido_cents
--     e data_liquidacao continuam existindo como PROJEÇÃO de compatibilidade
--     (soma das liquidações e data da última). Um trigger mantém o espelho para
--     qualquer caminho que ainda grave recebido_cents direto.
--  2. Histórico legado: uma liquidação por transação com recebido > 0, com o
--     VALOR ACUMULADO e precisao='legado_acumulado'. Pagamentos intermediários que
--     o banco nunca guardou não são reconstruídos.
--  3. RPCs transacionais: liquidar (trava de linha + idempotência), criar
--     empréstimo com parcelas, registrar conferência com ajuste, gerar
--     recorrências (único por ocorrência) e atualizar vencidos pela data.
--  4. eloi_auditoria — antes/depois de operações financeiras e estruturais.
--  5. eloi_saldos_contas — saldo oficial calculado no banco sobre TODO o histórico.
--
-- ⚠️ Produção: aplicar só com autorização escrita e depois do backup. Ordem:
--    esta migração → edge eloi-financas → app/dist. A edge nova depende das RPCs.

set search_path = pg_catalog, public;

-- ── Funções de apoio ─────────────────────────────────────────────────────────

-- "Hoje" no fuso do estúdio (espelha hojeEmSaoPaulo da edge).
create or replace function public.eloi_hoje() returns date
language sql stable set search_path = pg_catalog as $$
  select (now() at time zone 'America/Sao_Paulo')::date
$$;

-- Espelha statusPorValor (edge-functions/_shared/financas.ts). Mudou lá, muda aqui.
create or replace function public.eloi_status_por_valor(p_valor bigint, p_recebido bigint, p_vencimento date, p_hoje date)
returns public.eloi_status_mov
language sql immutable set search_path = pg_catalog, public as $$
  select case
    when p_recebido >= p_valor then 'realizado'
    when p_recebido > 0 then 'parcial'
    when p_vencimento is not null and p_vencimento < p_hoje then 'vencido'
    else 'pendente'
  end::public.eloi_status_mov
$$;

-- ── Auditoria ────────────────────────────────────────────────────────────────
create table if not exists public.eloi_auditoria (
  id          uuid primary key default gen_random_uuid(),
  em          timestamptz not null default now(),
  acao        text not null,
  tabela      text not null,
  registro_id uuid,
  antes       jsonb,
  depois      jsonb,
  motivo      text,
  autor       text not null default 'admin'
);
create index if not exists eloi_auditoria_registro_idx on public.eloi_auditoria (tabela, registro_id, em desc);
alter table public.eloi_auditoria enable row level security;
drop policy if exists sem_acesso_anon on public.eloi_auditoria;
create policy sem_acesso_anon on public.eloi_auditoria for all to anon, authenticated using (false) with check (false);
comment on table public.eloi_auditoria is
  'Trilha de operações financeiras e estruturais (antes/depois). Só a edge grava; nunca se edita.';

-- ── Liquidações ──────────────────────────────────────────────────────────────
create table if not exists public.eloi_liquidacoes (
  id                  uuid primary key default gen_random_uuid(),
  transacao_id        uuid not null references public.eloi_transacoes(id) on delete cascade,
  -- Positivo = pagamento/recebimento; negativo = reversão de uma liquidação.
  valor_cents         bigint not null check (valor_cents <> 0),
  data                date not null,
  conta_id            uuid references public.eloi_contas(id),
  forma_pagamento     text,
  origem              text not null check (origem in
                        ('manual', 'fatura', 'importacao', 'recorrencia', 'ajuste', 'legado', 'espelho', 'reversao')),
  -- Mesma chave = mesma operação: repetir a requisição não liquida duas vezes.
  chave_idempotencia  text unique,
  reverte_id          uuid references public.eloi_liquidacoes(id),
  -- exata: registrada no momento do pagamento. legado_acumulado: soma do que
  -- já tinha entrado antes desta tabela existir (data = última liquidação).
  -- espelho: criada pelo trigger para um caminho que gravou recebido_cents direto.
  precisao            text not null default 'exata' check (precisao in ('exata', 'legado_acumulado', 'espelho')),
  observacoes         text,
  autor               text not null default 'admin',
  criado_em           timestamptz not null default now()
);
create index if not exists eloi_liquidacoes_transacao_idx on public.eloi_liquidacoes (transacao_id, data);
create index if not exists eloi_liquidacoes_conta_data_idx on public.eloi_liquidacoes (conta_id, data);
create unique index if not exists eloi_liquidacoes_reversao_unica on public.eloi_liquidacoes (reverte_id) where reverte_id is not null;
alter table public.eloi_liquidacoes enable row level security;
drop policy if exists sem_acesso_anon on public.eloi_liquidacoes;
create policy sem_acesso_anon on public.eloi_liquidacoes for all to anon, authenticated using (false) with check (false);
comment on table public.eloi_liquidacoes is
  'Cada pagamento/recebimento de uma transação. A soma por transação = eloi_transacoes.recebido_cents (projeção de compatibilidade).';

-- Backfill legado ANTES do trigger de espelho existir (senão duplicaria).
insert into public.eloi_liquidacoes (transacao_id, valor_cents, data, conta_id, forma_pagamento, origem, precisao, observacoes)
select t.id, t.recebido_cents,
       coalesce(t.data_liquidacao, t.data_competencia, t.data_vencimento, t.created_at::date),
       t.conta_id, t.forma_pagamento, 'legado', 'legado_acumulado',
       case when t.data_liquidacao is null then 'sem data_liquidacao no legado: data aproximada pela competência' end
  from public.eloi_transacoes t
 where t.recebido_cents > 0
   and not exists (select 1 from public.eloi_liquidacoes l where l.transacao_id = t.id);

-- Espelho: qualquer escrita em recebido_cents que NÃO venha de uma RPC desta
-- migração (que liga eloi.liquidacao_registrada) ganha a liquidação equivalente.
-- Garante a invariante soma(liquidações) = recebido_cents sem depender de quem gravou.
create or replace function public.eloi_transacao_espelha_liquidacao() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
declare
  v_delta bigint;
begin
  if coalesce(current_setting('eloi.liquidacao_registrada', true), '') = '1' then
    return new;
  end if;
  v_delta := new.recebido_cents - coalesce(case when tg_op = 'UPDATE' then old.recebido_cents end, 0);
  if v_delta <> 0 then
    insert into public.eloi_liquidacoes (transacao_id, valor_cents, data, conta_id, forma_pagamento, origem, precisao)
    values (new.id, v_delta,
            coalesce(new.data_liquidacao, new.data_competencia, public.eloi_hoje()),
            new.conta_id, new.forma_pagamento,
            case new.origem when 'importacao' then 'importacao' when 'ajuste' then 'ajuste' else 'espelho' end,
            'espelho');
  end if;
  return new;
end $$;
drop trigger if exists trg_eloi_transacao_espelha_liquidacao on public.eloi_transacoes;
create trigger trg_eloi_transacao_espelha_liquidacao
  after insert or update of recebido_cents on public.eloi_transacoes
  for each row execute function public.eloi_transacao_espelha_liquidacao();

-- ── Recorrências: unicidade por ocorrência ───────────────────────────────────
-- `ocorrencia` = data em que a recorrência previa aquela cobrança. Diferente de
-- data_vencimento, não muda quando a conta é reagendada — por isso é a chave.
alter table public.eloi_transacoes add column if not exists ocorrencia date;
update public.eloi_transacoes set ocorrencia = coalesce(data_competencia, data_vencimento)
 where recorrencia_id is not null and ocorrencia is null;
-- Falha aqui = já existem duas transações da mesma recorrência na mesma data.
-- Em 2026-10-09 eram 0 (baseline). Se falhar, resolver os pares antes, à mão.
create unique index if not exists eloi_transacoes_recorrencia_ocorrencia
  on public.eloi_transacoes (recorrencia_id, ocorrencia) where recorrencia_id is not null;

alter table public.eloi_recorrencias add column if not exists ultima_geracao_em timestamptz;
alter table public.eloi_recorrencias add column if not exists ultimo_erro text;

-- Saldo inicial com data de referência (Etapa 5). Nulo = desde o primeiro lançamento.
alter table public.eloi_contas add column if not exists saldo_inicial_em date;
alter table public.eloi_contas add column if not exists arquivada_em timestamptz;

-- Tipo e contexto de conta com lançamentos não mudam: o histórico inteiro foi
-- classificado (e somado) com eles. Mudar = criar outra conta.
create or replace function public.eloi_conta_guarda_estrutura() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
begin
  if (new.tipo is distinct from old.tipo or new.contexto is distinct from old.contexto)
     and exists (select 1 from public.eloi_transacoes t
                  where t.conta_id = old.id or t.conta_destino_id = old.id) then
    raise exception 'conta com lançamentos não muda de tipo nem de contexto' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists trg_eloi_conta_guarda_estrutura on public.eloi_contas;
create trigger trg_eloi_conta_guarda_estrutura before update of tipo, contexto on public.eloi_contas
  for each row execute function public.eloi_conta_guarda_estrutura();

-- ── RPC: liquidar ────────────────────────────────────────────────────────────
-- p: { id, valor_cents, data, conta_id?, forma_pagamento?, observacoes?, chave? }
-- Trava a linha (FOR UPDATE): duas baixas simultâneas são serializadas e a
-- segunda vê o recebido atualizado. Mesma `chave` = devolve o estado atual sem
-- gravar de novo (clique duplo, retry de rede).
create or replace function public.eloi_liquidar(p jsonb) returns public.eloi_transacoes
language plpgsql security invoker set search_path = pg_catalog, public as $$
declare
  v_t       public.eloi_transacoes;
  v_valor   bigint := (p->>'valor_cents')::bigint;
  v_data    date := coalesce((p->>'data')::date, public.eloi_hoje());
  v_conta   uuid := nullif(p->>'conta_id', '')::uuid;
  v_chave   text := nullif(p->>'chave', '');
  v_soma    bigint;
  v_obs     text := nullif(btrim(coalesce(p->>'observacoes', '')), '');
begin
  if v_valor is null or v_valor <= 0 then
    raise exception 'valor_cents deve ser inteiro maior que zero' using errcode = '22023';
  end if;
  if v_chave is not null and exists (select 1 from public.eloi_liquidacoes where chave_idempotencia = v_chave) then
    select * into v_t from public.eloi_transacoes where id = (p->>'id')::uuid;
    return v_t;
  end if;
  select * into v_t from public.eloi_transacoes where id = (p->>'id')::uuid for update;
  if not found then raise exception 'transacao nao encontrada' using errcode = 'P0002'; end if;
  if v_t.status = 'cancelado' then
    raise exception 'lancamento cancelado: reabra antes de liquidar' using errcode = '22023';
  end if;
  v_soma := v_t.recebido_cents + v_valor;
  if v_soma > v_t.valor_cents then
    raise exception 'pagamento excede o valor em aberto' using errcode = '22023';
  end if;
  if v_conta is not null and not exists (select 1 from public.eloi_contas where id = v_conta) then
    raise exception 'conta nao encontrada' using errcode = '22023';
  end if;

  perform set_config('eloi.liquidacao_registrada', '1', true);
  insert into public.eloi_liquidacoes (transacao_id, valor_cents, data, conta_id, forma_pagamento, origem, chave_idempotencia, observacoes)
  values (v_t.id, v_valor, v_data, coalesce(v_conta, v_t.conta_id), coalesce(p->>'forma_pagamento', v_t.forma_pagamento),
          'manual', v_chave, v_obs);
  update public.eloi_transacoes set
    recebido_cents  = v_soma,
    status          = public.eloi_status_por_valor(v_t.valor_cents, v_soma, v_t.data_vencimento, public.eloi_hoje()),
    data_liquidacao = greatest(coalesce(v_t.data_liquidacao, v_data), v_data),
    forma_pagamento = coalesce(p->>'forma_pagamento', v_t.forma_pagamento),
    conta_id        = coalesce(v_conta, v_t.conta_id),
    observacoes     = case when v_obs is null then v_t.observacoes
                           else concat_ws(E'\n', v_t.observacoes, v_data::text || ': ' || v_obs) end,
    updated_at      = now()
  where id = v_t.id
  returning * into v_t;
  perform set_config('eloi.liquidacao_registrada', '', true);

  insert into public.eloi_auditoria (acao, tabela, registro_id, depois)
  values ('liquidar', 'eloi_transacoes', v_t.id,
          jsonb_build_object('valor_cents', v_valor, 'data', v_data, 'recebido_cents', v_t.recebido_cents, 'status', v_t.status));
  return v_t;
end $$;

-- ── RPC: reverter liquidação ─────────────────────────────────────────────────
-- Não apaga: grava a liquidação negativa ligada à original e recalcula a projeção.
create or replace function public.eloi_reverter_liquidacao(p_liquidacao uuid, p_motivo text) returns public.eloi_transacoes
language plpgsql security invoker set search_path = pg_catalog, public as $$
declare
  v_l public.eloi_liquidacoes;
  v_t public.eloi_transacoes;
  v_soma bigint;
  v_ult date;
begin
  if nullif(btrim(coalesce(p_motivo, '')), '') is null then
    raise exception 'motivo obrigatorio' using errcode = '22023';
  end if;
  select * into v_l from public.eloi_liquidacoes where id = p_liquidacao;
  if not found or v_l.valor_cents < 0 then raise exception 'liquidacao nao encontrada' using errcode = 'P0002'; end if;
  select * into v_t from public.eloi_transacoes where id = v_l.transacao_id for update;
  if exists (select 1 from public.eloi_liquidacoes where reverte_id = v_l.id) then
    raise exception 'liquidacao ja revertida' using errcode = '22023';
  end if;
  perform set_config('eloi.liquidacao_registrada', '1', true);
  insert into public.eloi_liquidacoes (transacao_id, valor_cents, data, conta_id, forma_pagamento, origem, reverte_id, observacoes)
  values (v_l.transacao_id, -v_l.valor_cents, public.eloi_hoje(), v_l.conta_id, v_l.forma_pagamento, 'reversao', v_l.id, p_motivo);
  select coalesce(sum(valor_cents), 0) into v_soma from public.eloi_liquidacoes where transacao_id = v_t.id;
  select max(l.data) into v_ult from public.eloi_liquidacoes l
   where l.transacao_id = v_t.id and l.valor_cents > 0
     and not exists (select 1 from public.eloi_liquidacoes r where r.reverte_id = l.id);
  update public.eloi_transacoes set
    recebido_cents = v_soma,
    data_liquidacao = case when v_soma > 0 then v_ult end,
    status = case when status = 'cancelado' then status
                  else public.eloi_status_por_valor(valor_cents, v_soma, data_vencimento, public.eloi_hoje()) end,
    updated_at = now()
  where id = v_t.id returning * into v_t;
  perform set_config('eloi.liquidacao_registrada', '', true);
  insert into public.eloi_auditoria (acao, tabela, registro_id, antes, depois, motivo)
  values ('reverter_liquidacao', 'eloi_liquidacoes', v_l.id, to_jsonb(v_l), jsonb_build_object('recebido_cents', v_soma), p_motivo);
  return v_t;
end $$;

-- ── RPC: pagamento de fatura (v2) ────────────────────────────────────────────
-- Mesma assinatura e mesma trava otimista da versão de 2026-10-08; agora grava a
-- liquidação de cada baixa (origem 'fatura', conta = conta que pagou) e aceita
-- chave de idempotência dentro de p_transferencia ('chave').
create or replace function public.eloi_pagar_fatura(p_transferencia jsonb, p_baixas jsonb)
returns setof public.eloi_transacoes
language plpgsql security invoker set search_path = pg_catalog, public as $$
declare
  v_transf public.eloi_transacoes;
  v_baixa  jsonb;
  v_linha  public.eloi_transacoes;
  v_atual  public.eloi_transacoes;
  v_n      int;
  v_chave  text := nullif(p_transferencia->>'chave', '');
begin
  if v_chave is not null then
    select t.* into v_transf from public.eloi_liquidacoes l join public.eloi_transacoes t on t.id = l.transacao_id
     where l.chave_idempotencia = v_chave;
    if found then return next v_transf; return; end if;
  end if;

  perform set_config('eloi.liquidacao_registrada', '1', true);
  insert into public.eloi_transacoes (
    tipo, contexto, status, descricao, valor_cents, recebido_cents,
    conta_id, conta_destino_id, categoria_id,
    data_competencia, data_vencimento, data_liquidacao, origem
  )
  select r.tipo, r.contexto, r.status, r.descricao, r.valor_cents, r.recebido_cents,
         r.conta_id, r.conta_destino_id, null,
         r.data_competencia, r.data_vencimento, r.data_liquidacao, r.origem
    from jsonb_populate_record(null::public.eloi_transacoes, p_transferencia) r
  returning * into v_transf;
  insert into public.eloi_liquidacoes (transacao_id, valor_cents, data, conta_id, origem, chave_idempotencia)
  values (v_transf.id, v_transf.recebido_cents, v_transf.data_liquidacao, v_transf.conta_id, 'fatura', v_chave);

  for v_baixa in select * from jsonb_array_elements(coalesce(p_baixas, '[]'::jsonb)) loop
    v_linha := jsonb_populate_record(null::public.eloi_transacoes, v_baixa);
    update public.eloi_transacoes t
       set recebido_cents  = v_linha.recebido_cents,
           status          = v_linha.status,
           data_liquidacao = v_linha.data_liquidacao,
           updated_at      = now()
     where t.id = v_linha.id
       and t.conta_id = v_transf.conta_destino_id
       and t.recebido_cents = (v_baixa->>'recebido_anterior')::bigint
       and t.status not in ('realizado', 'cancelado')
       and v_linha.recebido_cents <= t.valor_cents
    returning * into v_atual;
    get diagnostics v_n = row_count;
    if v_n <> 1 then
      raise exception 'fatura mudou durante o pagamento (transacao %)', v_linha.id;
    end if;
    insert into public.eloi_liquidacoes (transacao_id, valor_cents, data, conta_id, origem, observacoes)
    values (v_atual.id, v_linha.recebido_cents - (v_baixa->>'recebido_anterior')::bigint,
            v_linha.data_liquidacao, v_transf.conta_id, 'fatura', 'pagamento ' || v_transf.id::text);
  end loop;
  perform set_config('eloi.liquidacao_registrada', '', true);

  insert into public.eloi_auditoria (acao, tabela, registro_id, depois)
  values ('pagar_fatura', 'eloi_transacoes', v_transf.id,
          jsonb_build_object('valor_cents', v_transf.valor_cents, 'baixas', jsonb_array_length(coalesce(p_baixas, '[]'::jsonb))));
  return next v_transf;
end $$;

-- ── RPC: empréstimo com parcelas, numa transação ─────────────────────────────
-- p_emprestimo: colunas de eloi_emprestimos; p_parcelas: linhas de eloi_transacoes
-- já montadas pela edge (planoDeParcelasEmprestimo). emprestimo_id/grupo_id são
-- preenchidos aqui. Falha em qualquer parcela = nada gravado.
create or replace function public.eloi_criar_emprestimo(p_emprestimo jsonb, p_parcelas jsonb)
returns jsonb
language plpgsql security invoker set search_path = pg_catalog, public as $$
declare
  v_e public.eloi_emprestimos;
  v_n int;
begin
  insert into public.eloi_emprestimos (nome, instituicao, contexto, conta_id, categoria_id, valor_recebido_cents,
    parcelas_total, valor_parcela_cents, primeiro_vencimento, parcelas_pagas_antes, ativo, observacoes)
  select r.nome, r.instituicao, r.contexto, r.conta_id, r.categoria_id, coalesce(r.valor_recebido_cents, 0),
         r.parcelas_total, r.valor_parcela_cents, r.primeiro_vencimento, coalesce(r.parcelas_pagas_antes, 0),
         coalesce(r.ativo, true), r.observacoes
    from jsonb_populate_record(null::public.eloi_emprestimos, p_emprestimo) r
  returning * into v_e;

  insert into public.eloi_transacoes (tipo, contexto, descricao, valor_cents, recebido_cents, status, conta_id,
    categoria_id, fornecedor, data_competencia, data_vencimento, parcela_num, parcela_de, origem, emprestimo_id, grupo_id)
  select r.tipo, r.contexto, r.descricao, r.valor_cents, 0, r.status, r.conta_id, r.categoria_id, r.fornecedor,
         r.data_competencia, r.data_vencimento, r.parcela_num, r.parcela_de, 'parcelamento', v_e.id, v_e.id
    from jsonb_populate_recordset(null::public.eloi_transacoes, coalesce(p_parcelas, '[]'::jsonb)) r;
  get diagnostics v_n = row_count;

  insert into public.eloi_auditoria (acao, tabela, registro_id, depois)
  values ('criar_emprestimo', 'eloi_emprestimos', v_e.id, to_jsonb(v_e) || jsonb_build_object('parcelas_geradas', v_n));
  return jsonb_build_object(
    'emprestimo', to_jsonb(v_e),
    'transacoes', coalesce((select jsonb_agg(to_jsonb(t) order by t.parcela_num) from public.eloi_transacoes t where t.emprestimo_id = v_e.id), '[]'::jsonb));
end $$;

-- ── RPC: conferência de saldo com ajuste opcional, numa transação ────────────
-- p: { conta_id, data, saldo_informado_cents, saldo_sistema_cents, observacoes?, criar_ajuste? }
create or replace function public.eloi_registrar_conferencia(p jsonb) returns jsonb
language plpgsql security invoker set search_path = pg_catalog, public as $$
declare
  v_conta public.eloi_contas;
  v_inf bigint := (p->>'saldo_informado_cents')::bigint;
  v_sis bigint := (p->>'saldo_sistema_cents')::bigint;
  v_data date := (p->>'data')::date;
  v_dif bigint;
  v_obs text := nullif(btrim(coalesce(p->>'observacoes', '')), '');
  v_aj public.eloi_transacoes;
  v_conf public.eloi_conferencias;
begin
  select * into v_conta from public.eloi_contas where id = (p->>'conta_id')::uuid;
  if not found then raise exception 'conta nao encontrada' using errcode = 'P0002'; end if;
  v_dif := v_inf - v_sis;
  if coalesce((p->>'criar_ajuste')::boolean, false) and v_dif <> 0 then
    if v_obs is null then
      raise exception 'ajuste exige justificativa em observacoes' using errcode = '22023';
    end if;
    insert into public.eloi_transacoes (tipo, contexto, descricao, valor_cents, recebido_cents, status, conta_id,
      data_competencia, data_vencimento, data_liquidacao, origem, observacoes)
    values (case when v_dif > 0 then 'entrada' else 'saida' end::public.eloi_tipo_mov, v_conta.contexto,
      'Ajuste de conferência ' || v_data::text, abs(v_dif), abs(v_dif), 'realizado', v_conta.id,
      v_data, v_data, v_data, 'ajuste',
      format('Saldo informado %s × sistema %s — %s', to_char(v_inf / 100.0, 'FM999999990.00'), to_char(v_sis / 100.0, 'FM999999990.00'), v_obs))
    returning * into v_aj;
  end if;
  insert into public.eloi_conferencias (conta_id, data, saldo_informado_cents, saldo_sistema_cents, diferenca_cents, observacoes, ajuste_transacao_id)
  values (v_conta.id, v_data, v_inf, v_sis, v_dif, v_obs, v_aj.id)
  returning * into v_conf;
  insert into public.eloi_auditoria (acao, tabela, registro_id, depois, motivo)
  values ('conferencia', 'eloi_contas', v_conta.id, to_jsonb(v_conf), v_obs);
  return jsonb_build_object('conferencia', to_jsonb(v_conf), 'ajuste', case when v_aj.id is null then null else to_jsonb(v_aj) end);
end $$;

-- ── Próxima data de uma recorrência ──────────────────────────────────────────
-- Mensal em diante usa dia_cobranca (31 → 28/fev → 31/mar). A versão da edge
-- avançava a partir da última data e o dia "encolhia" para sempre depois de
-- fevereiro (31 → 28 → 28 …).
create or replace function public.eloi_proxima_ocorrencia(p_data date, p_periodicidade text, p_dia smallint)
returns date language plpgsql immutable set search_path = pg_catalog as $$
declare
  v_meses int := case p_periodicidade when 'mensal' then 1 when 'bimestral' then 2 when 'trimestral' then 3
                   when 'semestral' then 6 when 'anual' then 12 else null end;
  v_base date;
  v_dia int;
begin
  if p_periodicidade = 'semanal' then return p_data + 7; end if;
  if p_periodicidade = 'quinzenal' then return p_data + 15; end if;
  v_base := (date_trunc('month', p_data) + make_interval(months => coalesce(v_meses, 1)))::date;
  v_dia := coalesce(p_dia, extract(day from p_data)::int);
  return v_base + (least(v_dia, extract(day from (v_base + interval '1 month' - interval '1 day'))::int) - 1);
end $$;

-- ── RPC: gerar recorrências ──────────────────────────────────────────────────
-- Idempotente por (recorrencia_id, ocorrencia) no banco — não só na tela.
-- Trava consultiva: duas chamadas ao mesmo tempo (cron + painel) não competem.
-- Erro numa recorrência fica gravado em ultimo_erro e não impede as outras.
create or replace function public.eloi_gerar_recorrencias(p_antecedencia_dias int default 10, p_hoje date default null)
returns jsonb
language plpgsql security invoker set search_path = pg_catalog, public as $$
declare
  v_hoje date := coalesce(p_hoje, public.eloi_hoje());
  v_limite date := v_hoje + p_antecedencia_dias;
  r public.eloi_recorrencias;
  v_prox date;
  v_i int;
  v_criadas int := 0;
  v_erros jsonb := '[]'::jsonb;
  v_id uuid;
begin
  if not pg_try_advisory_xact_lock(hashtext('eloi_gerar_recorrencias')) then
    return jsonb_build_object('criadas', 0, 'erros', '[]'::jsonb, 'ocupado', true);
  end if;
  for r in select * from public.eloi_recorrencias
            where ativa and encerrada_em is null and pausada_em is null and proxima_cobranca <= v_limite
  loop
    begin
      v_prox := r.proxima_cobranca;
      v_i := 0;
      while v_i < 24 and v_prox <= v_limite and (r.fim is null or v_prox <= r.fim) loop
        insert into public.eloi_transacoes (tipo, contexto, status, descricao, valor_cents, conta_id, categoria_id,
          fornecedor, data_competencia, data_vencimento, recorrencia_id, ocorrencia, origem)
        values (r.tipo, r.contexto, public.eloi_status_por_valor(r.valor_cents, 0, v_prox, v_hoje), r.nome, r.valor_cents,
          r.conta_id, r.categoria_id, r.fornecedor, v_prox, v_prox, r.id, v_prox, 'recorrencia')
        on conflict (recorrencia_id, ocorrencia) where recorrencia_id is not null do nothing
        returning id into v_id;
        if v_id is not null then v_criadas := v_criadas + 1; v_id := null; end if;
        v_prox := public.eloi_proxima_ocorrencia(v_prox, r.periodicidade, r.dia_cobranca);
        v_i := v_i + 1;
      end loop;
      update public.eloi_recorrencias set proxima_cobranca = v_prox, ultima_geracao_em = now(), ultimo_erro = null
       where id = r.id;
    exception when others then
      v_erros := v_erros || jsonb_build_object('recorrencia_id', r.id, 'vencimento', v_prox, 'erro', sqlerrm);
      update public.eloi_recorrencias set ultimo_erro = left(sqlerrm, 500), ultima_geracao_em = now() where id = r.id;
    end;
  end loop;
  return jsonb_build_object('criadas', v_criadas, 'erros', v_erros);
end $$;

-- ── RPC: situação pela data ──────────────────────────────────────────────────
-- Vencido deixa de depender de alguém editar a linha. Só mexe em quem está em
-- aberto e sem nada recebido; parcial continua parcial (o valor decide).
create or replace function public.eloi_atualizar_vencidos(p_hoje date default null) returns int
language plpgsql security invoker set search_path = pg_catalog, public as $$
declare
  v_hoje date := coalesce(p_hoje, public.eloi_hoje());
  v_n int;
begin
  update public.eloi_transacoes t
     set status = public.eloi_status_por_valor(t.valor_cents, t.recebido_cents, t.data_vencimento, v_hoje),
         updated_at = now()
   where t.status in ('previsto', 'pendente', 'vencido')
     and t.recebido_cents = 0
     and t.status is distinct from public.eloi_status_por_valor(t.valor_cents, t.recebido_cents, t.data_vencimento, v_hoje)
     -- 'previsto' só vira 'vencido' (passou da data); antes disso continua previsto.
     and not (t.status = 'previsto' and (t.data_vencimento is null or t.data_vencimento >= v_hoje));
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- Rotina diária (cron): recorrências + vencidos. Sem abrir o painel.
create or replace function public.eloi_rotina_diaria() returns jsonb
language plpgsql security invoker set search_path = pg_catalog, public as $$
declare v_g jsonb; v_v int;
begin
  v_g := public.eloi_gerar_recorrencias();
  v_v := public.eloi_atualizar_vencidos();
  return v_g || jsonb_build_object('vencidos_atualizados', v_v, 'em', now());
end $$;

-- ── Saldos oficiais, sobre TODO o histórico ──────────────────────────────────
-- Mesma regra de saldoConta()/dividaDoCartao() do domínio: realizado e parcial
-- contam pelo recebido; cancelado não conta; transferência sai de uma e entra
-- na outra. Inclui contas arquivadas — arquivar não apaga dinheiro nem dívida.
create or replace function public.eloi_saldos_contas(p_ate date default null)
returns table (conta_id uuid, saldo_cents bigint, aberto_saida_cents bigint, aberto_entrada_cents bigint, lancamentos bigint)
language sql stable security invoker set search_path = pg_catalog, public as $$
  with t as (
    select x.*,
           -- valorLiquidado(): realizado legado sem recebido conta o valor inteiro
           case when x.status = 'realizado' and x.recebido_cents = 0 then x.valor_cents else x.recebido_cents end liq,
           coalesce(x.data_liquidacao, x.created_at::date) quando
      from public.eloi_transacoes x
     where x.status <> 'cancelado'
  ), mov as (
    select t.conta_id cid,
           case when p_ate is null or t.quando <= p_ate then
             case when t.tipo = 'entrada' then t.liq else -t.liq end
           else 0 end v,
           case when t.tipo = 'saida' and t.status in ('previsto','pendente','parcial','vencido') then t.valor_cents - t.recebido_cents else 0 end ab_s,
           case when t.tipo = 'entrada' and t.status in ('previsto','pendente','parcial','vencido') then t.valor_cents - t.recebido_cents else 0 end ab_e
      from t
    union all
    select t.conta_destino_id,
           case when p_ate is null or t.quando <= p_ate then t.liq else 0 end, 0, 0
      from t where t.tipo = 'transferencia'
  )
  select c.id,
         (c.saldo_inicial_cents + coalesce(sum(m.v), 0))::bigint,
         coalesce(sum(m.ab_s), 0)::bigint,
         coalesce(sum(m.ab_e), 0)::bigint,
         count(m.cid)
    from public.eloi_contas c left join mov m on m.cid = c.id
   group by c.id, c.saldo_inicial_cents
$$;

-- ── Permissões: só a edge (service_role) chama ───────────────────────────────
do $$
declare f text;
begin
  foreach f in array array[
    'eloi_liquidar(jsonb)', 'eloi_reverter_liquidacao(uuid, text)', 'eloi_pagar_fatura(jsonb, jsonb)',
    'eloi_criar_emprestimo(jsonb, jsonb)', 'eloi_registrar_conferencia(jsonb)',
    'eloi_gerar_recorrencias(integer, date)', 'eloi_atualizar_vencidos(date)', 'eloi_rotina_diaria()',
    'eloi_saldos_contas(date)', 'eloi_transacao_espelha_liquidacao()', 'eloi_conta_guarda_estrutura()'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
