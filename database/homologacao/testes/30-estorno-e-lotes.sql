-- Etapa 5: estorno de pagamento de fatura e lotes de importação. Roda depois de
-- 10/20 (o pagamento 'fat-1' do teste 10 quitou a compra ...05 do cartão c1).
\set ON_ERROR_STOP 1
create or replace function pg_temp.afirma(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond, false) then raise exception 'FALHOU: %', msg; end if; raise notice 'ok: %', msg; end $$;
create or replace function pg_temp.invariante() returns boolean language sql as $$
  select not exists (select 1 from eloi_transacoes t
    where t.recebido_cents <> coalesce((select sum(valor_cents) from eloi_liquidacoes l where l.transacao_id = t.id), 0)) $$;
create or replace function pg_temp.saldo(c text) returns bigint language sql as $$
  select saldo_cents from eloi_saldos_contas() where conta_id = c::uuid $$;
create or replace function pg_temp.recusa(sql text, msg text) returns void language plpgsql as $$
begin
  execute sql;
  raise exception 'FALHOU: %', msg;
exception when others then
  if sqlerrm like 'FALHOU%' then raise; end if;
  raise notice 'ok: % (%)', msg, sqlerrm;
end $$;

-- ── Rastro do pagamento ──────────────────────────────────────────────────────
select pg_temp.afirma((select pagamento_id from eloi_liquidacoes where transacao_id = '00000000-0000-0000-0000-000000000005' and origem = 'fatura')
  = (select transacao_id from eloi_liquidacoes where chave_idempotencia = 'fat-1'), 'baixa da compra aponta o pagamento que a quitou');

-- ── Estorno de pagamento de fatura ───────────────────────────────────────────
create temp table antes as select pg_temp.saldo('00000000-0000-0000-0000-0000000000a1') a1;
select pg_temp.recusa($$select eloi_estornar_pagamento_fatura((select transacao_id from eloi_liquidacoes where chave_idempotencia = 'fat-1'), '  ')$$,
  'estorno sem motivo recusado');
select eloi_estornar_pagamento_fatura((select transacao_id from eloi_liquidacoes where chave_idempotencia = 'fat-1'), 'pago na conta errada');
select pg_temp.afirma((select status::text from eloi_transacoes where id = (select transacao_id from eloi_liquidacoes where chave_idempotencia = 'fat-1')) = 'cancelado',
  'transferência do pagamento fica cancelada (não apagada)');
select pg_temp.afirma((select recebido_cents from eloi_transacoes where id = '00000000-0000-0000-0000-000000000005') = 0, 'compra volta a dever');
select pg_temp.afirma((select status::text from eloi_transacoes where id = '00000000-0000-0000-0000-000000000005') in ('pendente', 'vencido'), 'status da compra re-derivado');
select pg_temp.afirma(pg_temp.saldo('00000000-0000-0000-0000-0000000000a1') = (select a1 from antes) + 12000, 'dinheiro volta ao saldo da conta');
select pg_temp.afirma((select aberto_saida_cents from eloi_saldos_contas() where conta_id = '00000000-0000-0000-0000-0000000000c1') = 12000, 'fatura do cartão reaberta');
select pg_temp.afirma((select count(*) from eloi_auditoria where acao = 'estornar_pagamento_fatura') = 1, 'estorno fica na trilha');
select pg_temp.afirma(pg_temp.invariante(), 'invariante após estorno');
select pg_temp.recusa($$select eloi_estornar_pagamento_fatura((select transacao_id from eloi_liquidacoes where chave_idempotencia = 'fat-1'), 'de novo')$$,
  'estorno duplo recusado');
select pg_temp.recusa($$select eloi_estornar_pagamento_fatura('00000000-0000-0000-0000-000000000004', 'não é fatura')$$,
  'transferência entre contas comuns não é estornada como fatura');
-- Pagamento legado (gravado direto, sem a RPC): sem rastro, sem estorno automático.
insert into eloi_transacoes (id, tipo, contexto, status, descricao, valor_cents, recebido_cents, conta_id, conta_destino_id,
  data_competencia, data_vencimento, data_liquidacao, origem)
values ('00000000-0000-0000-0000-0000000000e1', 'transferencia', 'pessoal', 'realizado', 'Pagamento antigo', 1000, 1000,
  '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c1', '2026-08-09', '2026-08-09', '2026-08-09', 'manual');
select pg_temp.recusa($$select eloi_estornar_pagamento_fatura('00000000-0000-0000-0000-0000000000e1', 'antigo')$$,
  'pagamento legado sem rastro não é estornado às cegas');

-- Pagar de novo, parcial, e estornar: só a parte deste pagamento volta.
select * from eloi_pagar_fatura(
  '{"tipo":"transferencia","contexto":"pessoal","status":"realizado","descricao":"Pagamento 2","valor_cents":5000,"recebido_cents":5000,"conta_id":"00000000-0000-0000-0000-0000000000a1","conta_destino_id":"00000000-0000-0000-0000-0000000000c1","data_competencia":"2026-10-10","data_vencimento":"2026-10-10","data_liquidacao":"2026-10-10","origem":"manual","chave":"fat-2"}',
  '[{"id":"00000000-0000-0000-0000-000000000005","recebido_anterior":0,"recebido_cents":5000,"status":"parcial","data_liquidacao":"2026-10-10"}]');
select * from eloi_pagar_fatura(
  '{"tipo":"transferencia","contexto":"pessoal","status":"realizado","descricao":"Pagamento 3","valor_cents":3000,"recebido_cents":3000,"conta_id":"00000000-0000-0000-0000-0000000000a1","conta_destino_id":"00000000-0000-0000-0000-0000000000c1","data_competencia":"2026-10-11","data_vencimento":"2026-10-11","data_liquidacao":"2026-10-11","origem":"manual","chave":"fat-3"}',
  '[{"id":"00000000-0000-0000-0000-000000000005","recebido_anterior":5000,"recebido_cents":8000,"status":"parcial","data_liquidacao":"2026-10-11"}]');
select eloi_estornar_pagamento_fatura((select transacao_id from eloi_liquidacoes where chave_idempotencia = 'fat-2'), 'teste parcial');
select pg_temp.afirma((select recebido_cents from eloi_transacoes where id = '00000000-0000-0000-0000-000000000005') = 3000, 'estorno parcial devolve só os 5000 daquele pagamento');
select pg_temp.afirma((select data_liquidacao from eloi_transacoes where id = '00000000-0000-0000-0000-000000000005') = '2026-10-11', 'data de liquidação = a do pagamento que ficou');
select pg_temp.afirma(pg_temp.invariante(), 'invariante após estorno parcial');

-- ── Lotes de importação ──────────────────────────────────────────────────────
create temp table b0 as select pg_temp.saldo('00000000-0000-0000-0000-0000000000a2') b;
create temp table lote1 as select eloi_importar(
  '{"conta_id":"00000000-0000-0000-0000-0000000000a2","contexto":"pessoal","arquivo":"extrato.ofx","formato":"ofx"}',
  '[{"tipo":"entrada","contexto":"pessoal","descricao":"PIX recebido","valor_cents":1000,"recebido_cents":1000,"status":"realizado","conta_id":"00000000-0000-0000-0000-0000000000a2","data_competencia":"2026-10-01","data_vencimento":"2026-10-01","data_liquidacao":"2026-10-01","importacao_chave":"fitid|A1"},
    {"tipo":"saida","contexto":"pessoal","descricao":"Padaria","valor_cents":300,"recebido_cents":300,"status":"realizado","conta_id":"00000000-0000-0000-0000-0000000000a2","data_competencia":"2026-10-02","data_vencimento":"2026-10-02","data_liquidacao":"2026-10-02","importacao_chave":"fitid|A2"},
    {"tipo":"saida","contexto":"pessoal","descricao":"Padaria","valor_cents":300,"recebido_cents":300,"status":"realizado","conta_id":"00000000-0000-0000-0000-0000000000a2","data_competencia":"2026-10-02","data_vencimento":"2026-10-02","data_liquidacao":"2026-10-02","importacao_chave":"fitid|A2"}]') r;
select pg_temp.afirma((select (r->>'importadas')::int from lote1) = 2, 'lote importa 2 e pula a chave repetida no mesmo arquivo');
select pg_temp.afirma((select ignoradas from eloi_importacoes where id = (select (r->'lote'->>'id')::uuid from lote1)) = 1, 'lote conta a ignorada');
select pg_temp.afirma(pg_temp.saldo('00000000-0000-0000-0000-0000000000a2') = (select b from b0) + 700, 'saldo da conta recebe o lote');
select pg_temp.afirma((select count(*) from eloi_liquidacoes where origem = 'importacao' and precisao = 'exata') = 2, 'linha realizada importada ganha liquidação exata (não espelho)');
select pg_temp.afirma(pg_temp.invariante(), 'invariante após importar');
create temp table lote2 as select eloi_importar(
  '{"conta_id":"00000000-0000-0000-0000-0000000000a2","contexto":"pessoal","arquivo":"extrato.ofx","formato":"ofx"}',
  '[{"tipo":"entrada","contexto":"pessoal","descricao":"PIX recebido","valor_cents":1000,"recebido_cents":1000,"status":"realizado","conta_id":"00000000-0000-0000-0000-0000000000a2","data_competencia":"2026-10-01","data_vencimento":"2026-10-01","data_liquidacao":"2026-10-01","importacao_chave":"fitid|A1"}]') r;
select pg_temp.afirma((select (r->>'importadas')::int from lote2) = 0, 'reimportar o mesmo arquivo não duplica');

select pg_temp.recusa(format($$select eloi_reverter_importacao(%L, '')$$, (select r->'lote'->>'id' from lote1)), 'desfazer sem motivo recusado');
select eloi_reverter_importacao((select (r->'lote'->>'id')::uuid from lote1), 'arquivo da conta errada');
select pg_temp.afirma(pg_temp.saldo('00000000-0000-0000-0000-0000000000a2') = (select b from b0), 'desfazer devolve o saldo de antes');
select pg_temp.afirma((select count(*) from eloi_transacoes where importacao_chave like 'fitid|A%') = 0, 'linhas do lote saem');
select pg_temp.afirma((select count(*) from eloi_auditoria where acao = 'desfazer_importacao') = 2, 'cada linha removida fica inteira na trilha');
select pg_temp.afirma((select revertidas from eloi_importacoes where id = (select (r->'lote'->>'id')::uuid from lote1)) = 2, 'lote marcado como desfeito');
select pg_temp.recusa(format($$select eloi_reverter_importacao(%L, 'de novo')$$, (select r->'lote'->>'id' from lote1)), 'desfazer duas vezes recusado');
create temp table lote3 as select eloi_importar(
  '{"conta_id":"00000000-0000-0000-0000-0000000000a2","contexto":"pessoal","arquivo":"certo.ofx","formato":"ofx"}',
  '[{"tipo":"entrada","contexto":"pessoal","descricao":"PIX recebido","valor_cents":1000,"recebido_cents":1000,"status":"realizado","conta_id":"00000000-0000-0000-0000-0000000000a2","data_competencia":"2026-10-01","data_vencimento":"2026-10-01","data_liquidacao":"2026-10-01","importacao_chave":"fitid|A1"}]') r;
select pg_temp.afirma((select (r->>'importadas')::int from lote3) = 1, 'depois de desfazer, a chave fica livre para o arquivo certo');

-- Lote de cartão pago depois: desfazer é recusado até estornar o pagamento.
create temp table lote4 as select eloi_importar(
  '{"conta_id":"00000000-0000-0000-0000-0000000000c1","contexto":"pessoal","arquivo":"fatura.csv","formato":"csv"}',
  '[{"tipo":"saida","contexto":"pessoal","descricao":"Livraria","valor_cents":4000,"recebido_cents":0,"status":"pendente","conta_id":"00000000-0000-0000-0000-0000000000c1","data_competencia":"2026-10-03","data_vencimento":"2026-11-09","importacao_chave":"2026-10-03|-4000|livraria"}]') r;
select * from eloi_pagar_fatura(
  '{"tipo":"transferencia","contexto":"pessoal","status":"realizado","descricao":"Pagamento 4","valor_cents":4000,"recebido_cents":4000,"conta_id":"00000000-0000-0000-0000-0000000000a1","conta_destino_id":"00000000-0000-0000-0000-0000000000c1","data_competencia":"2026-10-12","data_vencimento":"2026-10-12","data_liquidacao":"2026-10-12","origem":"manual","chave":"fat-4"}',
  format('[{"id":"%s","recebido_anterior":0,"recebido_cents":4000,"status":"realizado","data_liquidacao":"2026-10-12"}]',
    (select id from eloi_transacoes where importacao_chave = '2026-10-03|-4000|livraria'))::jsonb);
select pg_temp.recusa(format($$select eloi_reverter_importacao(%L, 'errado')$$, (select r->'lote'->>'id' from lote4)), 'lote com compra já paga não se desfaz');
select pg_temp.afirma((select count(*) from eloi_transacoes where importacao_chave = '2026-10-03|-4000|livraria') = 1, 'recusa não apaga nada');
select eloi_estornar_pagamento_fatura((select transacao_id from eloi_liquidacoes where chave_idempotencia = 'fat-4'), 'fatura errada');
select eloi_reverter_importacao((select (r->'lote'->>'id')::uuid from lote4), 'fatura errada');
select pg_temp.afirma((select count(*) from eloi_transacoes where importacao_chave = '2026-10-03|-4000|livraria') = 0, 'depois do estorno, o lote se desfaz');
select pg_temp.afirma(pg_temp.invariante(), 'invariante no fim da etapa 5');
