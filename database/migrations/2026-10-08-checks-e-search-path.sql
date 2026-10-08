-- 2026-10-08 · Travas no banco para o que a edge já valida + search_path fixo.
--
-- (a) Valor nunca negativo. A edge recusa (servicos.upsert, orcamentos
--     create/update), mas o banco é a última camada: SQL manual, function
--     nova ou bug não gravam serviço de -R$ 500.
--     Conferido antes (SELECT, 2026-10-08): 0 linhas violando em cada tabela.
--     valor_total segue em REAIS (exceção herdada); valor_cents em cents.
alter table public.eloi_servicos
  add constraint eloi_servicos_valor_cents_nao_negativo check (valor_cents >= 0);
alter table public.orcamentos
  add constraint orcamentos_valor_total_nao_negativo check (valor_total >= 0);

-- (b) search_path fixo nas funções de trigger (advisor
--     function_search_path_mutable). Sem isso, quem cria objeto num schema
--     que vem antes de `public` no search_path da sessão sequestra o nome
--     que o trigger resolve.
alter function public.eloi_servico_espelhos() set search_path = pg_catalog, public;
alter function public.eloi_nota_propaga_numero() set search_path = pg_catalog, public;
