-- 2026-10-08 · Remove o caixa legado (eloi_caixas + eloi_movimentos_financeiros).
--
-- Substituído por eloi_contas/eloi_transacoes (2026-08-04-gestao-eloi-financeiro.sql).
-- Últimos consumidores saíram no mesmo dia: edge eloi-financeiro (arquivo
-- apagado) e a query de clientes.detail em eloi-gestao.
--
-- Conferido antes (SELECT, 2026-10-08):
--   · 0 linhas nas duas tabelas;
--   · nenhuma view, função, trigger ou FK DE FORA aponta para elas — as únicas
--     FKs são as das próprias movimentações (→ eloi_caixas, eloi_clientes,
--     eloi_servicos, orcamentos), que somem junto.
--
-- ⚠️ ORDEM: aplicar só DEPOIS de (1) publicar a eloi-gestao nova (sem a query
-- de movimentos) e (2) apagar a function eloi-financeiro do Supabase
-- (`supabase functions delete eloi-financeiro`). Antes disso as duas ainda
-- consultam estas tabelas e passariam a responder erro.
--
-- Trava: se aparecer linha até lá, aborta em vez de apagar dado.
do $$
begin
  if exists (select 1 from public.eloi_movimentos_financeiros)
     or exists (select 1 from public.eloi_caixas) then
    raise exception 'caixa legado tem dados — revisar antes de remover';
  end if;
end $$;

drop table public.eloi_movimentos_financeiros;
drop table public.eloi_caixas;
