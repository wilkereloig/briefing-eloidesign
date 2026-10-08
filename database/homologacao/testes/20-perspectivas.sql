\set ON_ERROR_STOP 1
create or replace function pg_temp.afirma(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond, false) then raise exception 'FALHOU: %', msg; end if; raise notice 'ok: %', msg; end $$;

select pg_temp.afirma((select natureza from eloi_categorias where nome='Empréstimos recebidos') = 'patrimonial', 'regra de nome: empréstimo recebido é patrimonial');
select pg_temp.afirma((select natureza from eloi_categorias where nome='Mercado') = 'operacional', 'categoria comum continua operacional (sem adivinhar)');
select pg_temp.afirma((select natureza_definida_por from eloi_categorias where nome='Mercado') is null, 'categoria comum fica na fila de revisão');

-- Caixa de setembro/2026 (liquidações; o teste 10 já rodou e mexeu em t2/t3/t5).
select pg_temp.afirma((select sum(entradas_cents) from eloi_caixa_realizado('2026-09-01','2026-09-30') where natureza='patrimonial') = 100000, 'empréstimo recebido aparece no caixa como patrimonial');
select pg_temp.afirma((select sum(entradas_cents) from eloi_caixa_realizado('2026-09-01','2026-09-30') where natureza='operacional') = 50000, 'entrada operacional de setembro = 50000');
select pg_temp.afirma((select sum(entradas_cents) - sum(saidas_cents) from eloi_caixa_realizado('2026-09-01','2026-09-30') where natureza='entre_contextos') = 0, 'transferência entre contextos soma zero no consolidado');
select pg_temp.afirma((select sum(saidas_cents) from eloi_caixa_realizado('2026-09-01','2026-09-30','pessoal') where natureza='entre_contextos') = 2000, 'no pessoal, o aporte aparece como saída entre contextos');
select pg_temp.afirma((select sum(aproximado_cents) from eloi_caixa_realizado('2026-09-01','2026-09-30')) > 0, 'caixa avisa quanto é legado acumulado');

-- Competência: valor original no mês da compra, pago ou não; patrimonial fora do operacional.
select pg_temp.afirma((select sum(despesas_cents) from eloi_resultado_competencia('2026-09-01','2026-09-30','pessoal') where natureza='operacional') = 30000 + 20000 + 12000, 'despesas de setembro pela competência: Y + Z + compra no cartão');
select pg_temp.afirma((select coalesce(sum(receitas_cents),0) from eloi_resultado_competencia('2026-09-01','2026-09-30','pessoal') where natureza='operacional') = 50000, 'empréstimo recebido não é receita operacional');
select pg_temp.afirma((select sum(receitas_cents) from eloi_resultado_competencia('2026-10-01','2026-10-31') where natureza='ajuste') = 700, 'ajuste de conferência separado do operacional');

-- Obrigações em aberto.
select pg_temp.afirma((select sum(falta_cents) from eloi_obrigacoes_abertas('pessoal','2026-10-09') where tipo='saida') =
  (select sum(valor_cents - recebido_cents) from eloi_transacoes where tipo='saida' and contexto='pessoal' and status in ('previsto','pendente','parcial','vencido')), 'obrigações em aberto batem com as linhas');
