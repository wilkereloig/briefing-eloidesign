-- REVERSÃO só da etapa 5 (2026-10-09-estorno-fatura-e-lotes-importacao.sql).
-- Mantém liquidações, natureza e rotina diária. Perde: o vínculo baixa → pagamento
-- (pagamento_id) e o registro dos lotes de importação; as linhas importadas
-- continuam, só deixam de apontar o lote. Estornos e lotes desfeitos já gravados
-- ficam como estão (reversões em eloi_liquidacoes, trilha em eloi_auditoria).
-- Depois deste script, reaplicar eloi_pagar_fatura de
-- 2026-10-09-liquidacoes-e-operacoes-atomicas.sql (a v2 não usa pagamento_id).
-- Ordem em produção: app/dist anterior → edge anterior → este script.
begin;
drop function if exists public.eloi_reverter_importacao(uuid, text);
drop function if exists public.eloi_importar(jsonb, jsonb);
drop function if exists public.eloi_estornar_pagamento_fatura(uuid, text);
drop function if exists public.eloi_reprojetar_transacao(uuid);
alter table public.eloi_transacoes drop column if exists importacao_id;
drop table if exists public.eloi_importacoes;
alter table public.eloi_liquidacoes drop column if exists pagamento_id;
commit;
