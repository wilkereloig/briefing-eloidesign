-- Rodado DEPOIS da migração. Cada bloco levanta exceção se a regra falhar.
\set ON_ERROR_STOP 1
create or replace function pg_temp.afirma(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond, false) then raise exception 'FALHOU: %', msg; end if; raise notice 'ok: %', msg; end $$;

-- Backfill: uma liquidação legado por transação com recebido > 0, valor acumulado.
select pg_temp.afirma((select count(*) from eloi_liquidacoes where origem='legado') = 5, 'backfill cria 5 liquidações legado (t1, t2, t4, t7, t8)');
select pg_temp.afirma((select precisao from eloi_liquidacoes where transacao_id='00000000-0000-0000-0000-000000000002') = 'legado_acumulado', 'precisão legado_acumulado');
select pg_temp.afirma(not exists (select 1 from eloi_transacoes t where t.recebido_cents <> coalesce((select sum(valor_cents) from eloi_liquidacoes l where l.transacao_id=t.id),0)), 'invariante soma(liquidações)=recebido após backfill');
select pg_temp.afirma((select ocorrencia from eloi_transacoes where recorrencia_id is not null limit 1) = '2026-01-31', 'ocorrência preenchida no legado');

-- Saldos oficiais = regra do domínio. A: 10000 +50000 -10000 -5000 = 45000; B: +5000 -700(legado realizado) = 4300.
select pg_temp.afirma((select saldo_cents from eloi_saldos_contas() where conta_id='00000000-0000-0000-0000-0000000000a1') = 45000, 'saldo A = 45000');
select pg_temp.afirma((select saldo_cents from eloi_saldos_contas() where conta_id='00000000-0000-0000-0000-0000000000a2') = 4300, 'saldo B = 4300 (inclui realizado legado sem recebido)');
select pg_temp.afirma((select aberto_saida_cents from eloi_saldos_contas() where conta_id='00000000-0000-0000-0000-0000000000c1') = 12000, 'cartão deve 12000');
select pg_temp.afirma((select saldo_cents from eloi_saldos_contas('2026-09-11') where conta_id='00000000-0000-0000-0000-0000000000a1') = 60000, 'saldo A em 11/09 = 60000 (antes da parcial de 12/09)');

-- Liquidar: parcial em outra conta, depois quitação; liquidação por evento.
select eloi_liquidar('{"id":"00000000-0000-0000-0000-000000000002","valor_cents":5000,"data":"2026-09-20","conta_id":"00000000-0000-0000-0000-0000000000a2","chave":"k-1"}');
select pg_temp.afirma((select recebido_cents from eloi_transacoes where id='00000000-0000-0000-0000-000000000002') = 15000, 'liquidar soma ao recebido');
select pg_temp.afirma((select count(*) from eloi_liquidacoes where transacao_id='00000000-0000-0000-0000-000000000002') = 2, 'cada pagamento é um registro');
select pg_temp.afirma((select conta_id from eloi_liquidacoes where chave_idempotencia='k-1') = '00000000-0000-0000-0000-0000000000a2', 'liquidação guarda a conta do pagamento');
-- Idempotência: mesma chave não liquida de novo.
select eloi_liquidar('{"id":"00000000-0000-0000-0000-000000000002","valor_cents":5000,"data":"2026-09-20","chave":"k-1"}');
select pg_temp.afirma((select recebido_cents from eloi_transacoes where id='00000000-0000-0000-0000-000000000002') = 15000, 'mesma chave = sem segunda baixa');
-- Excesso recusado e nada gravado.
do $$ begin
  perform eloi_liquidar('{"id":"00000000-0000-0000-0000-000000000002","valor_cents":999999}');
  raise exception 'FALHOU: excesso aceito';
exception when others then if sqlerrm like 'FALHOU%' then raise; end if; raise notice 'ok: excesso recusado (%)', sqlerrm; end $$;
select eloi_liquidar('{"id":"00000000-0000-0000-0000-000000000002","valor_cents":15000,"data":"2026-09-25"}');
select pg_temp.afirma((select status::text from eloi_transacoes where id='00000000-0000-0000-0000-000000000002') = 'realizado', 'quitação vira realizado');

-- Reversão: grava negativa, recalcula projeção e status.
select eloi_reverter_liquidacao((select id from eloi_liquidacoes where chave_idempotencia='k-1'), 'teste de reversão');
select pg_temp.afirma((select recebido_cents from eloi_transacoes where id='00000000-0000-0000-0000-000000000002') = 25000, 'reversão desconta 5000');
select pg_temp.afirma((select status::text from eloi_transacoes where id='00000000-0000-0000-0000-000000000002') = 'parcial', 'reversão volta a parcial');
do $$ begin
  perform eloi_reverter_liquidacao((select id from eloi_liquidacoes where chave_idempotencia='k-1'), 'de novo');
  raise exception 'FALHOU: reversão dupla aceita';
exception when others then if sqlerrm like 'FALHOU%' then raise; end if; raise notice 'ok: reversão dupla recusada'; end $$;

-- Caminho legado (UPDATE direto) mantém a invariante pelo trigger de espelho.
update eloi_transacoes set recebido_cents = 2000, status='parcial' where id='00000000-0000-0000-0000-000000000003';
select pg_temp.afirma((select count(*) from eloi_liquidacoes where transacao_id='00000000-0000-0000-0000-000000000003' and precisao='espelho') = 1, 'UPDATE direto ganha liquidação espelho');
select pg_temp.afirma(not exists (select 1 from eloi_transacoes t where t.recebido_cents <> coalesce((select sum(valor_cents) from eloi_liquidacoes l where l.transacao_id=t.id),0)), 'invariante mantida após todos os caminhos');

-- Pagamento de fatura v2: transferência + baixa + liquidações; idempotente.
select * from eloi_pagar_fatura(
  '{"tipo":"transferencia","contexto":"pessoal","status":"realizado","descricao":"Pagamento","valor_cents":12000,"recebido_cents":12000,"conta_id":"00000000-0000-0000-0000-0000000000a1","conta_destino_id":"00000000-0000-0000-0000-0000000000c1","data_competencia":"2026-10-09","data_vencimento":"2026-10-09","data_liquidacao":"2026-10-09","origem":"manual","chave":"fat-1"}',
  '[{"id":"00000000-0000-0000-0000-000000000005","recebido_anterior":0,"recebido_cents":12000,"status":"realizado","data_liquidacao":"2026-10-09"}]');
select * from eloi_pagar_fatura(
  '{"tipo":"transferencia","contexto":"pessoal","status":"realizado","descricao":"Pagamento","valor_cents":12000,"recebido_cents":12000,"conta_id":"00000000-0000-0000-0000-0000000000a1","conta_destino_id":"00000000-0000-0000-0000-0000000000c1","data_competencia":"2026-10-09","data_vencimento":"2026-10-09","data_liquidacao":"2026-10-09","origem":"manual","chave":"fat-1"}',
  '[{"id":"00000000-0000-0000-0000-000000000005","recebido_anterior":0,"recebido_cents":12000,"status":"realizado","data_liquidacao":"2026-10-09"}]');
select pg_temp.afirma((select count(*) from eloi_transacoes where tipo='transferencia' and conta_destino_id='00000000-0000-0000-0000-0000000000c1') = 1, 'pagamento de fatura repetido não debita duas vezes');
select pg_temp.afirma((select aberto_saida_cents from eloi_saldos_contas() where conta_id='00000000-0000-0000-0000-0000000000c1') = 0, 'fatura quitada');
select pg_temp.afirma((select count(*) from eloi_transacoes where tipo='saida' and conta_id='00000000-0000-0000-0000-0000000000a1' and descricao='Pagamento') = 0, 'pagamento de fatura não cria despesa');
select pg_temp.afirma(not exists (select 1 from eloi_transacoes t where t.recebido_cents <> coalesce((select sum(valor_cents) from eloi_liquidacoes l where l.transacao_id=t.id),0)), 'invariante após fatura');

-- Empréstimo atômico: parcela inválida (sem conta) = nada gravado.
do $$ begin
  perform eloi_criar_emprestimo('{"nome":"Emp X","contexto":"pessoal","conta_id":"00000000-0000-0000-0000-0000000000a1","parcelas_total":2,"valor_parcela_cents":1000,"primeiro_vencimento":"2026-11-01"}',
    '[{"tipo":"saida","contexto":"pessoal","descricao":"Emp X (1/2)","valor_cents":1000,"status":"pendente","conta_id":"00000000-0000-0000-0000-0000000000a1","data_competencia":"2026-11-01","data_vencimento":"2026-11-01","parcela_num":1,"parcela_de":2},
      {"tipo":"saida","contexto":"pessoal","descricao":"Emp X (2/2)","valor_cents":1000,"status":"pendente","conta_id":null,"data_competencia":"2026-12-01","data_vencimento":"2026-12-01","parcela_num":2,"parcela_de":2}]');
  raise exception 'FALHOU: parcela inválida aceita';
exception when others then if sqlerrm like 'FALHOU%' then raise; end if; raise notice 'ok: empréstimo recusado inteiro (%)', sqlerrm; end $$;
select pg_temp.afirma(not exists (select 1 from eloi_emprestimos where nome='Emp X'), 'nenhum cadastro órfão de empréstimo');
select eloi_criar_emprestimo('{"nome":"Emp Y","contexto":"pessoal","conta_id":"00000000-0000-0000-0000-0000000000a1","parcelas_total":2,"valor_parcela_cents":1000,"primeiro_vencimento":"2026-11-01"}',
  '[{"tipo":"saida","contexto":"pessoal","descricao":"Emp Y (1/2)","valor_cents":1000,"status":"pendente","conta_id":"00000000-0000-0000-0000-0000000000a1","data_competencia":"2026-11-01","data_vencimento":"2026-11-01","parcela_num":1,"parcela_de":2},
    {"tipo":"saida","contexto":"pessoal","descricao":"Emp Y (2/2)","valor_cents":1000,"status":"pendente","conta_id":"00000000-0000-0000-0000-0000000000a1","data_competencia":"2026-12-01","data_vencimento":"2026-12-01","parcela_num":2,"parcela_de":2}]');
select pg_temp.afirma((select count(*) from eloi_transacoes t join eloi_emprestimos e on e.id=t.emprestimo_id where e.nome='Emp Y') = 2, 'empréstimo válido gera as 2 parcelas');

-- Conferência: ajuste exige justificativa; com justificativa grava os dois juntos.
do $$ begin
  perform eloi_registrar_conferencia('{"conta_id":"00000000-0000-0000-0000-0000000000a2","data":"2026-10-01","saldo_informado_cents":5000,"saldo_sistema_cents":4300,"criar_ajuste":true}');
  raise exception 'FALHOU: ajuste sem justificativa';
exception when others then if sqlerrm like 'FALHOU%' then raise; end if; raise notice 'ok: ajuste sem justificativa recusado'; end $$;
select pg_temp.afirma((select count(*) from eloi_conferencias) = 0 and not exists (select 1 from eloi_transacoes where origem='ajuste'), 'nada gravado quando a conferência falha');
select eloi_registrar_conferencia('{"conta_id":"00000000-0000-0000-0000-0000000000a2","data":"2026-10-01","saldo_informado_cents":5000,"saldo_sistema_cents":4300,"criar_ajuste":true,"observacoes":"tarifa não lançada"}');
select pg_temp.afirma((select c.ajuste_transacao_id is not null from eloi_conferencias c) , 'conferência ligada ao ajuste');

-- Conta com histórico não muda de tipo/contexto.
do $$ begin
  update eloi_contas set contexto='empresa' where id='00000000-0000-0000-0000-0000000000a1';
  raise exception 'FALHOU: contexto mudou';
exception when others then if sqlerrm like 'FALHOU%' then raise; end if; raise notice 'ok: contexto travado'; end $$;
update eloi_contas set nome='Conta Teste A renomeada' where id='00000000-0000-0000-0000-0000000000a1';
select pg_temp.afirma(true, 'renomear conta com histórico continua permitido');

-- Recorrências: gera do legado até hoje+10 sem duplicar a ocorrência já existente; dia 31 não encolhe.
select eloi_gerar_recorrencias(10, '2026-04-05');
select pg_temp.afirma((select count(*) from eloi_transacoes where recorrencia_id='00000000-0000-0000-0000-0000000000f1') = 3, 'jan (existente) + fev + mar');
select pg_temp.afirma((select string_agg(ocorrencia::text, ',' order by ocorrencia) from eloi_transacoes where recorrencia_id='00000000-0000-0000-0000-0000000000f1') = '2026-01-31,2026-02-28,2026-03-31', 'dia de cobrança 31 respeitado após fevereiro');
select eloi_gerar_recorrencias(10, '2026-04-05');
select pg_temp.afirma((select count(*) from eloi_transacoes where recorrencia_id='00000000-0000-0000-0000-0000000000f1') = 3, 'segunda chamada não duplica');
do $$ begin
  insert into eloi_transacoes (tipo, contexto, status, descricao, valor_cents, conta_id, data_competencia, data_vencimento, recorrencia_id, ocorrencia, origem)
  values ('saida','pessoal','pendente','dup',3000,'00000000-0000-0000-0000-0000000000a1','2026-02-28','2026-02-28','00000000-0000-0000-0000-0000000000f1','2026-02-28','recorrencia');
  raise exception 'FALHOU: banco aceitou ocorrência duplicada';
exception when unique_violation then raise notice 'ok: índice único barra ocorrência duplicada'; end $$;
-- Recorrência com erro (conta nula) fica registrada, não some.
insert into eloi_recorrencias (id, nome, tipo, contexto, valor_cents, periodicidade, conta_id, proxima_cobranca)
values ('00000000-0000-0000-0000-0000000000f2','Sem conta','saida','pessoal',100,'mensal',null,'2026-04-01');
select pg_temp.afirma(jsonb_array_length(eloi_gerar_recorrencias(10, '2026-04-05')->'erros') = 1, 'erro de geração devolvido');
select pg_temp.afirma((select ultimo_erro is not null from eloi_recorrencias where id='00000000-0000-0000-0000-0000000000f2'), 'erro gravado na recorrência');

-- Vencidos pela data.
select eloi_atualizar_vencidos('2026-12-31');
select pg_temp.afirma((select status::text from eloi_transacoes t join eloi_emprestimos e on e.id=t.emprestimo_id where e.nome='Emp Y' and t.parcela_num=1) = 'vencido', 'parcela passada vira vencido sem edição');
select eloi_atualizar_vencidos('2026-10-01');
select pg_temp.afirma((select status::text from eloi_transacoes t join eloi_emprestimos e on e.id=t.emprestimo_id where e.nome='Emp Y' and t.parcela_num=1) = 'pendente', 'reagendado para o futuro volta a pendente');

-- Permissões: anon/authenticated não executam as RPCs.
select pg_temp.afirma(not has_function_privilege('anon', 'eloi_liquidar(jsonb)', 'execute'), 'anon não executa eloi_liquidar');
select pg_temp.afirma(not has_function_privilege('authenticated', 'eloi_saldos_contas(date)', 'execute'), 'authenticated não lê saldos');
