-- REVERSÃO das migrações de 2026-10-09 (liquidações, natureza, rotina diária, etapa 5).
-- Volta o schema ao estado de 2026-10-08 sem perder transações: recebido_cents,
-- status e data_liquidacao continuaram sendo gravados como projeção, então o
-- app antigo segue funcionando com eles. O que se PERDE: o detalhe por
-- pagamento (eloi_liquidacoes), a trilha (eloi_auditoria) e a natureza das
-- categorias. Exporte as duas tabelas antes, se forem guardar.
-- Ordem de reversão em produção: app/dist antigo → edge antiga → este script.
-- As migrações de reconciliação (2026-07-15 e reconcilia-schema) NÃO são
-- revertidas: elas só registram o que já existia.
begin;
-- Etapa 5 primeiro: eloi_transacoes.importacao_id aponta eloi_importacoes.
drop function if exists public.eloi_reverter_importacao(uuid, text);
drop function if exists public.eloi_importar(jsonb, jsonb);
drop function if exists public.eloi_estornar_pagamento_fatura(uuid, text);
drop function if exists public.eloi_reprojetar_transacao(uuid);
alter table public.eloi_transacoes drop column if exists importacao_id;
drop table if exists public.eloi_importacoes;
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'eloi-rotina-diaria';
  end if;
end $$;
drop function if exists public.eloi_caixa_realizado(date, date, eloi_contexto);
drop function if exists public.eloi_resultado_competencia(date, date, eloi_contexto);
drop function if exists public.eloi_obrigacoes_abertas(eloi_contexto, date);
drop view if exists public.eloi_revisao_natureza;
alter table public.eloi_categorias drop constraint if exists eloi_categorias_natureza_check;
alter table public.eloi_categorias drop column if exists natureza, drop column if exists natureza_definida_por;

drop function if exists public.eloi_rotina_diaria();
drop function if exists public.eloi_atualizar_vencidos(date);
drop function if exists public.eloi_gerar_recorrencias(integer, date);
drop function if exists public.eloi_proxima_ocorrencia(date, text, smallint);
drop function if exists public.eloi_registrar_conferencia(jsonb);
drop function if exists public.eloi_criar_emprestimo(jsonb, jsonb);
drop function if exists public.eloi_reverter_liquidacao(uuid, text);
drop function if exists public.eloi_liquidar(jsonb);
drop function if exists public.eloi_saldos_contas(date);
drop trigger if exists trg_eloi_transacao_espelha_liquidacao on public.eloi_transacoes;
drop function if exists public.eloi_transacao_espelha_liquidacao();
drop trigger if exists trg_eloi_conta_guarda_estrutura on public.eloi_contas;
drop function if exists public.eloi_conta_guarda_estrutura();
drop table if exists public.eloi_liquidacoes;
drop table if exists public.eloi_auditoria;
drop index if exists public.eloi_transacoes_recorrencia_ocorrencia;
alter table public.eloi_transacoes drop column if exists ocorrencia;
alter table public.eloi_recorrencias drop column if exists ultima_geracao_em, drop column if exists ultimo_erro;
alter table public.eloi_contas drop column if exists saldo_inicial_em, drop column if exists arquivada_em;
drop function if exists public.eloi_status_por_valor(bigint, bigint, date, date);
drop function if exists public.eloi_hoje();
commit;
-- eloi_pagar_fatura volta à versão de 2026-10-08: reaplicar
-- database/migrations/2026-10-08-pagar-fatura.sql logo depois deste script.
