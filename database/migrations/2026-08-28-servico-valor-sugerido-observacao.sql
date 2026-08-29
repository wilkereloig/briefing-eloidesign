-- Cliente pode deixar uma observação junto com o valor sugerido (portal,
-- aba Pendências) — contexto pro dono decidir aprovar/rejeitar.
--
-- Coluna dedicada, não reaproveita eloi_servicos.observacoes: aquela é nota
-- interna do estúdio (FolhaServico, item 0.5 do Horizonte 0); misturar as
-- duas faria o cliente escrever por cima de anotação do dono, ou o contrário.

alter table public.eloi_servicos
  add column if not exists valor_sugerido_observacao text;

comment on column public.eloi_servicos.valor_sugerido_observacao is
  'Observação que o cliente escreveu junto com valor_sugerido_cents. Limpa junto ao aprovar ou rejeitar, igual valor_sugerido_em.';
