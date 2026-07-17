-- Gestão redesign: separa competência (mês da NF) do pagamento.
alter table eloi_servicos add column if not exists data_competencia date;

-- Backfill: nas 37 notas, a data de emissão foi gravada em data_pagamento.
update eloi_servicos
   set data_competencia = data_pagamento
 where nf_numero is not null
   and nf_numero <> ''
   and data_competencia is null;
