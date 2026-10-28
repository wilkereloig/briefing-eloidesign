-- Serviço que o dono decidiu não faturar (cliente não pediu nota).
-- Sai do alerta "concluído sem nota". Puramente aditiva; default false.
alter table public.eloi_servicos
  add column if not exists dispensa_nf boolean not null default false;
comment on column public.eloi_servicos.dispensa_nf is 'true = serviço dispensado de nota fiscal (decisão do dono); não aparece como "concluído sem nota".';
