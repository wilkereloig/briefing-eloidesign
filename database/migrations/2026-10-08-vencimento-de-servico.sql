-- Vencimento do pagamento de serviço.
--
-- eloi_servicos não tinha data de vencimento: a regra "pagamento atrasado"
-- (domain/decisoes.ts) usava data_competencia no lugar. Só que competência
-- é a que mês o trabalho pertence — decide Projetos, Notas e Relatórios.
-- Gravar a data em que o cliente paga ali move a receita de mês (aconteceu
-- com o Cartoon SCW, competência 09/2026, pago em 10 e 11/2026).
--
-- Regra: atrasado = não pago e coalesce(data_vencimento, data_competencia) < hoje.
-- Derivado, não gravado. Nulo = vence na competência, como antes.

alter table public.eloi_servicos
  add column if not exists data_vencimento date;
comment on column public.eloi_servicos.data_vencimento is
  'Quando o cliente paga. Nulo = vence na data_competencia. Atrasado = não pago e vencimento < hoje (derivado).';
