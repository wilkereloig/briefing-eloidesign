-- Cliente sugere o valor de um serviço ainda sem preço fechado; o dono aprova.
--
-- eloi_servicos.valor_cents já é o valor OFICIAL, usado em relatório e
-- faturamento — não dá pra deixar o cliente escrever nele direto. As duas
-- colunas novas guardam a sugestão à parte; só a edge admin (eloi-gestao,
-- servicos.aprovar_valor_sugerido) copia pra valor_cents.

alter table public.eloi_servicos
  add column if not exists valor_sugerido_cents bigint,
  add column if not exists valor_sugerido_em timestamptz;

comment on column public.eloi_servicos.valor_sugerido_cents is
  'Valor que o cliente digitou no portal (aba Pendências), aguardando aprovação do dono. NULL = sem sugestão pendente.';
comment on column public.eloi_servicos.valor_sugerido_em is
  'Quando o cliente enviou a sugestão. Limpo junto com valor_sugerido_cents ao aprovar ou rejeitar.';
