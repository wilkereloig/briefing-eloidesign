-- Dados SINTÉTICOS no formato legado (antes da migração de liquidações).
-- Nenhum nome, valor ou conta real. Aplicado ANTES da migração 2026-10-09.
insert into eloi_contas (id, nome, tipo, contexto, saldo_inicial_cents, ativa) values
  ('00000000-0000-0000-0000-0000000000a1', 'Conta Teste A', 'corrente', 'pessoal', 10000, true),
  ('00000000-0000-0000-0000-0000000000a2', 'Conta Teste B', 'digital',  'pessoal', 0, true),
  ('00000000-0000-0000-0000-0000000000e1', 'Conta Empresa', 'corrente', 'empresa', 0, true);
insert into eloi_contas (id, nome, tipo, contexto, saldo_inicial_cents, ativa, dia_fechamento, dia_vencimento) values
  ('00000000-0000-0000-0000-0000000000c1', 'Cartão Teste', 'cartao_credito', 'pessoal', 0, true, 2, 9);
insert into eloi_categorias (id, nome, contexto, tipo) values
  ('00000000-0000-0000-0000-0000000000d1', 'Mercado', 'pessoal', 'saida'),
  ('00000000-0000-0000-0000-0000000000d2', 'Salário', 'pessoal', 'entrada');
-- t1: entrada liquidada inteira; t2: despesa parcial; t3: despesa aberta vencida;
-- t4: transferência A→B; t5: compra no cartão aberta; t6: realizado legado sem recebido.
insert into eloi_transacoes (id, tipo, contexto, status, descricao, valor_cents, recebido_cents, conta_id, conta_destino_id, categoria_id,
  data_competencia, data_vencimento, data_liquidacao, origem) values
  ('00000000-0000-0000-0000-000000000001','entrada','pessoal','realizado','Entrada X',50000,50000,'00000000-0000-0000-0000-0000000000a1',null,'00000000-0000-0000-0000-0000000000d2','2026-09-05','2026-09-05','2026-09-05','manual'),
  ('00000000-0000-0000-0000-000000000002','saida','pessoal','parcial','Despesa Y',30000,10000,'00000000-0000-0000-0000-0000000000a1',null,'00000000-0000-0000-0000-0000000000d1','2026-09-10','2026-09-10','2026-09-12','manual'),
  ('00000000-0000-0000-0000-000000000003','saida','pessoal','pendente','Despesa Z',20000,0,'00000000-0000-0000-0000-0000000000a1',null,'00000000-0000-0000-0000-0000000000d1','2026-09-01','2026-09-01',null,'manual'),
  ('00000000-0000-0000-0000-000000000004','transferencia','pessoal','realizado','Transf',5000,5000,'00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a2',null,'2026-09-15','2026-09-15','2026-09-15','manual'),
  ('00000000-0000-0000-0000-000000000005','saida','pessoal','pendente','Compra cartão',12000,0,'00000000-0000-0000-0000-0000000000c1',null,'00000000-0000-0000-0000-0000000000d1','2026-09-20','2026-10-09',null,'importacao'),
  ('00000000-0000-0000-0000-000000000006','saida','pessoal','realizado','Legado sem recebido',700,0,'00000000-0000-0000-0000-0000000000a2',null,'00000000-0000-0000-0000-0000000000d1','2026-08-01','2026-08-01',null,'manual');
insert into eloi_recorrencias (id, nome, tipo, contexto, valor_cents, periodicidade, dia_cobranca, conta_id, categoria_id, inicio, proxima_cobranca) values
  ('00000000-0000-0000-0000-0000000000f1','Assinatura','saida','pessoal',3000,'mensal',31,'00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d1','2026-01-31','2026-01-31');
-- ocorrência já gerada pelo caminho antigo (deve ser reconhecida, não duplicada)
insert into eloi_transacoes (tipo, contexto, status, descricao, valor_cents, conta_id, categoria_id, data_competencia, data_vencimento, recorrencia_id, origem)
values ('saida','pessoal','vencido','Assinatura',3000,'00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d1','2026-01-31','2026-01-31','00000000-0000-0000-0000-0000000000f1','recorrencia');
-- Empréstimo recebido (patrimonial pela regra de nome) numa conta só dele.
insert into eloi_contas (id, nome, tipo, contexto, saldo_inicial_cents, ativa) values
  ('00000000-0000-0000-0000-0000000000a3', 'Conta Teste C', 'corrente', 'pessoal', 0, true);
insert into eloi_categorias (id, nome, contexto, tipo) values
  ('00000000-0000-0000-0000-0000000000d3', 'Empréstimos recebidos', 'pessoal', 'entrada');
insert into eloi_transacoes (id, tipo, contexto, status, descricao, valor_cents, recebido_cents, conta_id, categoria_id,
  data_competencia, data_vencimento, data_liquidacao, origem) values
  ('00000000-0000-0000-0000-000000000007','entrada','pessoal','realizado','Empréstimo entrou',100000,100000,'00000000-0000-0000-0000-0000000000a3','00000000-0000-0000-0000-0000000000d3','2026-09-03','2026-09-03','2026-09-03','manual');
-- Transferência ENTRE CONTEXTOS (pessoal → empresa): neutra no consolidado.
insert into eloi_transacoes (id, tipo, contexto, status, descricao, valor_cents, recebido_cents, conta_id, conta_destino_id,
  data_competencia, data_vencimento, data_liquidacao, origem) values
  ('00000000-0000-0000-0000-000000000008','transferencia','pessoal','realizado','Aporte',2000,2000,'00000000-0000-0000-0000-0000000000a3','00000000-0000-0000-0000-0000000000e1','2026-09-04','2026-09-04','2026-09-04','manual');
