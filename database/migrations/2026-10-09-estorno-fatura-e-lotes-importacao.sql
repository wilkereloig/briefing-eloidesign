-- 2026-10-09 · Etapa 5: pagamento de fatura rastreável e estornável; importação
-- em lote que se desfaz. Aditivo. Depende de 2026-10-09-liquidacoes-e-operacoes-atomicas.sql.
--
--  1. eloi_liquidacoes.pagamento_id — cada baixa de compra aponta a transferência
--     (pagamento de fatura) que a quitou. Preenchido para o que a v2 já gravou
--     (observacoes = 'pagamento <id>'); pagamentos anteriores às liquidações não
--     têm esse rastro e continuam sem estorno automático.
--  2. eloi_pagar_fatura v3 grava pagamento_id; eloi_estornar_pagamento_fatura
--     reverte as baixas daquele pagamento, cancela a transferência e deixa trilha.
--  3. eloi_importacoes — um lote por arquivo importado; eloi_importar grava lote +
--     linhas + liquidações numa transação; eloi_reverter_importacao desfaz o lote
--     inteiro se nada dele foi pago ou ligado a outra coisa depois.
--
-- ⚠️ Pelo MCP do Supabase, `drop` trava a chamada: em produção aplicar sem os
--    `drop … if exists` (objetos novos) — ver docs/EVOLUCAO-FINANCEIRO.md.

set search_path = pg_catalog, public;

-- ── 1. Rastro do pagamento ──────────────────────────────────────────────────
alter table public.eloi_liquidacoes add column if not exists pagamento_id uuid references public.eloi_transacoes(id);
create index if not exists eloi_liquidacoes_pagamento_idx on public.eloi_liquidacoes (pagamento_id) where pagamento_id is not null;
update public.eloi_liquidacoes l set pagamento_id = substr(l.observacoes, 11)::uuid
 where l.pagamento_id is null and l.origem = 'fatura'
   and l.observacoes ~ '^pagamento [0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   and exists (select 1 from public.eloi_transacoes t where t.id = substr(l.observacoes, 11)::uuid);

-- ── 2a. Pagar fatura v3 (igual à v2 + pagamento_id nas baixas) ──────────────
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
    insert into public.eloi_liquidacoes (transacao_id, valor_cents, data, conta_id, origem, pagamento_id, observacoes)
    values (v_atual.id, v_linha.recebido_cents - (v_baixa->>'recebido_anterior')::bigint,
            v_linha.data_liquidacao, v_transf.conta_id, 'fatura', v_transf.id, 'pagamento ' || v_transf.id::text);
  end loop;
  perform set_config('eloi.liquidacao_registrada', '', true);

  insert into public.eloi_auditoria (acao, tabela, registro_id, depois)
  values ('pagar_fatura', 'eloi_transacoes', v_transf.id,
          jsonb_build_object('valor_cents', v_transf.valor_cents, 'baixas', jsonb_array_length(coalesce(p_baixas, '[]'::jsonb))));
  return next v_transf;
end $$;

-- Projeção de uma transação a partir das liquidações (recebido, última data,
-- status). Uma regra só para estorno de fatura e reversão.
create or replace function public.eloi_reprojetar_transacao(p_id uuid) returns void
language plpgsql security invoker set search_path = pg_catalog, public as $$
declare v_soma bigint; v_ult date;
begin
  select coalesce(sum(valor_cents), 0) into v_soma from public.eloi_liquidacoes where transacao_id = p_id;
  select max(l.data) into v_ult from public.eloi_liquidacoes l
   where l.transacao_id = p_id and l.valor_cents > 0
     and not exists (select 1 from public.eloi_liquidacoes r where r.reverte_id = l.id);
  update public.eloi_transacoes set
    recebido_cents  = v_soma,
    data_liquidacao = case when v_soma > 0 then v_ult end,
    status = case when status = 'cancelado' then status
                  else public.eloi_status_por_valor(valor_cents, v_soma, data_vencimento, public.eloi_hoje()) end,
    updated_at = now()
  where id = p_id;
end $$;

-- ── 2b. Estornar pagamento de fatura ─────────────────────────────────────────
-- Reverte cada baixa que ESTE pagamento fez (as compras voltam a dever), reverte
-- a liquidação da própria transferência e a cancela (sai do saldo da conta).
-- Nada é apagado: a trilha fica em eloi_liquidacoes (reversões) e eloi_auditoria.
create or replace function public.eloi_estornar_pagamento_fatura(p_transferencia uuid, p_motivo text)
returns jsonb
language plpgsql security invoker set search_path = pg_catalog, public as $$
declare
  v_t public.eloi_transacoes;
  v_l public.eloi_liquidacoes;
  v_compras int := 0;
  v_ids uuid[];
begin
  if nullif(btrim(coalesce(p_motivo, '')), '') is null then
    raise exception 'motivo obrigatorio' using errcode = '22023';
  end if;
  select * into v_t from public.eloi_transacoes where id = p_transferencia for update;
  if not found then raise exception 'pagamento nao encontrado' using errcode = 'P0002'; end if;
  if v_t.tipo <> 'transferencia' or not exists (
       select 1 from public.eloi_contas c where c.id = v_t.conta_destino_id and c.tipo = 'cartao_credito') then
    raise exception 'isto nao e um pagamento de fatura' using errcode = '22023';
  end if;
  if v_t.status = 'cancelado' then raise exception 'pagamento ja estornado' using errcode = '22023'; end if;
  -- Só pagamento registrado pela RPC (liquidação exata da própria transferência)
  -- sabe quais compras quitou. Os anteriores não têm esse rastro.
  if not exists (select 1 from public.eloi_liquidacoes
                  where transacao_id = v_t.id and origem = 'fatura' and precisao = 'exata') then
    raise exception 'pagamento anterior ao registro por pagamento: o sistema nao sabe quais compras ele quitou. Corrija com outra transferencia.'
      using errcode = '22023';
  end if;

  -- Trava as compras em ordem de id: dois estornos/pagamentos simultâneos não
  -- se cruzam em deadlock.
  select array_agg(distinct transacao_id order by transacao_id) into v_ids
    from public.eloi_liquidacoes where pagamento_id = v_t.id;
  perform 1 from public.eloi_transacoes where id = any(coalesce(v_ids, '{}')) order by id for update;

  perform set_config('eloi.liquidacao_registrada', '1', true);
  for v_l in select * from public.eloi_liquidacoes l
              where (l.pagamento_id = v_t.id or l.transacao_id = v_t.id) and l.valor_cents > 0
                and not exists (select 1 from public.eloi_liquidacoes r where r.reverte_id = l.id)
              order by l.transacao_id loop
    insert into public.eloi_liquidacoes (transacao_id, valor_cents, data, conta_id, origem, reverte_id, pagamento_id, observacoes)
    values (v_l.transacao_id, -v_l.valor_cents, public.eloi_hoje(), v_l.conta_id, 'reversao', v_l.id,
            v_l.pagamento_id, 'estorno do pagamento: ' || p_motivo);
    if v_l.transacao_id <> v_t.id then v_compras := v_compras + 1; end if;
  end loop;
  for v_l in select distinct on (transacao_id) * from public.eloi_liquidacoes where pagamento_id = v_t.id loop
    perform public.eloi_reprojetar_transacao(v_l.transacao_id);
  end loop;
  update public.eloi_transacoes set
    recebido_cents = 0, data_liquidacao = null, status = 'cancelado',
    observacoes = concat_ws(E'\n', observacoes, public.eloi_hoje()::text || ': pagamento estornado — ' || p_motivo),
    updated_at = now()
  where id = v_t.id;
  perform set_config('eloi.liquidacao_registrada', '', true);

  insert into public.eloi_auditoria (acao, tabela, registro_id, antes, depois, motivo)
  values ('estornar_pagamento_fatura', 'eloi_transacoes', v_t.id, to_jsonb(v_t),
          jsonb_build_object('compras_reabertas', v_compras), p_motivo);
  return jsonb_build_object('transferencia_id', v_t.id, 'compras_reabertas', v_compras);
end $$;

-- ── 3. Lotes de importação ───────────────────────────────────────────────────
create table if not exists public.eloi_importacoes (
  id               uuid primary key default gen_random_uuid(),
  conta_id         uuid not null references public.eloi_contas(id),
  contexto         public.eloi_contexto not null,
  arquivo          text,
  formato          text not null default 'outro' check (formato in ('csv', 'ofx', 'outro')),
  linhas_recebidas int not null default 0,
  importadas       int not null default 0,
  ignoradas        int not null default 0,
  criada_em        timestamptz not null default now(),
  autor            text not null default 'admin',
  revertida_em     timestamptz,
  revertida_motivo text,
  revertidas       int
);
create index if not exists eloi_importacoes_conta_idx on public.eloi_importacoes (conta_id, criada_em desc);
alter table public.eloi_importacoes enable row level security;
drop policy if exists sem_acesso_anon on public.eloi_importacoes;
create policy sem_acesso_anon on public.eloi_importacoes for all to anon, authenticated using (false) with check (false);
comment on table public.eloi_importacoes is
  'Um lote por arquivo de extrato importado. Desfazer remove as linhas do lote (com trilha em eloi_auditoria).';

alter table public.eloi_transacoes add column if not exists importacao_id uuid references public.eloi_importacoes(id) on delete set null;
create index if not exists eloi_transacoes_importacao_lote_idx on public.eloi_transacoes (importacao_id) where importacao_id is not null;

-- Lote + linhas + liquidações das linhas já realizadas, numa transação. Chave
-- repetida na conta é pulada (mesmo índice único de sempre); a contagem volta.
create or replace function public.eloi_importar(p_lote jsonb, p_linhas jsonb) returns jsonb
language plpgsql security invoker set search_path = pg_catalog, public as $$
declare
  v_lote public.eloi_importacoes;
  v_total int := jsonb_array_length(coalesce(p_linhas, '[]'::jsonb));
  v_n int;
begin
  insert into public.eloi_importacoes (conta_id, contexto, arquivo, formato, linhas_recebidas)
  select r.conta_id, r.contexto, left(r.arquivo, 200), coalesce(r.formato, 'outro'), coalesce(nullif(r.linhas_recebidas, 0), v_total)
    from jsonb_populate_record(null::public.eloi_importacoes, p_lote) r
  returning * into v_lote;

  perform set_config('eloi.liquidacao_registrada', '1', true);
  with novas as (
    insert into public.eloi_transacoes (tipo, contexto, descricao, valor_cents, recebido_cents, status, conta_id,
      data_competencia, data_vencimento, data_liquidacao, origem, importacao_chave, importacao_id)
    select r.tipo, r.contexto, r.descricao, r.valor_cents, r.recebido_cents, r.status, r.conta_id,
           r.data_competencia, r.data_vencimento, r.data_liquidacao, 'importacao', r.importacao_chave, v_lote.id
      from jsonb_populate_recordset(null::public.eloi_transacoes, coalesce(p_linhas, '[]'::jsonb)) r
    on conflict (conta_id, importacao_chave) where importacao_chave is not null do nothing
    returning id, recebido_cents, data_liquidacao, conta_id
  ), liq as (
    insert into public.eloi_liquidacoes (transacao_id, valor_cents, data, conta_id, origem)
    select id, recebido_cents, data_liquidacao, conta_id, 'importacao' from novas where recebido_cents > 0
  )
  select count(*) into v_n from novas;
  perform set_config('eloi.liquidacao_registrada', '', true);

  -- `ignoradas` do lote: as que a edge já pulou antes (p_lote.ignoradas) + as
  -- que o índice único pulou aqui.
  update public.eloi_importacoes set importadas = v_n,
         ignoradas = coalesce((p_lote->>'ignoradas')::int, 0) + v_total - v_n
   where id = v_lote.id returning * into v_lote;
  insert into public.eloi_auditoria (acao, tabela, registro_id, depois)
  values ('importar', 'eloi_importacoes', v_lote.id, to_jsonb(v_lote));
  return jsonb_build_object('lote', to_jsonb(v_lote), 'importadas', v_n, 'ignoradas', v_lote.ignoradas);
end $$;

-- Desfazer um lote: só se NADA dele foi mexido de forma que apagar perca dado —
-- pago depois (fatura, baixa manual), com nota fiscal ou arquivo anexado. A
-- linha apagada fica inteira em eloi_auditoria; a chave fica livre para
-- reimportar o arquivo certo.
create or replace function public.eloi_reverter_importacao(p_lote uuid, p_motivo text) returns jsonb
language plpgsql security invoker set search_path = pg_catalog, public as $$
declare
  v_lote public.eloi_importacoes;
  v_bloq int;
  v_n int;
begin
  if nullif(btrim(coalesce(p_motivo, '')), '') is null then
    raise exception 'motivo obrigatorio' using errcode = '22023';
  end if;
  select * into v_lote from public.eloi_importacoes where id = p_lote for update;
  if not found then raise exception 'importacao nao encontrada' using errcode = 'P0002'; end if;
  if v_lote.revertida_em is not null then raise exception 'importacao ja desfeita' using errcode = '22023'; end if;
  perform 1 from public.eloi_transacoes where importacao_id = p_lote order by id for update;

  select count(*) into v_bloq from public.eloi_transacoes t
   where t.importacao_id = p_lote and (
         -- pagamento vigente que não veio da importação (par pagamento+estorno não conta)
         exists (select 1 from public.eloi_liquidacoes l
                  where l.transacao_id = t.id and l.origem not in ('importacao', 'reversao')
                    and not exists (select 1 from public.eloi_liquidacoes r where r.reverte_id = l.id))
      or exists (select 1 from public.eloi_notas_fiscais n where n.transacao_id = t.id)
      or exists (select 1 from public.eloi_arquivos a where a.transacao_id = t.id)
      or exists (select 1 from public.eloi_conferencias c where c.ajuste_transacao_id = t.id));
  if v_bloq > 0 then
    raise exception '% lancamento(s) deste lote ja foram pagos, conciliados ou tem nota/arquivo: estorne ou desvincule antes de desfazer', v_bloq
      using errcode = '22023';
  end if;

  insert into public.eloi_auditoria (acao, tabela, registro_id, antes, motivo)
  select 'desfazer_importacao', 'eloi_transacoes', t.id, to_jsonb(t), p_motivo
    from public.eloi_transacoes t where t.importacao_id = p_lote;
  delete from public.eloi_transacoes where importacao_id = p_lote;
  get diagnostics v_n = row_count;
  update public.eloi_importacoes set revertida_em = now(), revertida_motivo = p_motivo, revertidas = v_n
   where id = p_lote returning * into v_lote;
  return jsonb_build_object('lote', to_jsonb(v_lote), 'removidas', v_n);
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'eloi_pagar_fatura(jsonb, jsonb)', 'eloi_reprojetar_transacao(uuid)',
    'eloi_estornar_pagamento_fatura(uuid, text)', 'eloi_importar(jsonb, jsonb)',
    'eloi_reverter_importacao(uuid, text)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
