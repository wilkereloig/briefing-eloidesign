-- REVERSÃO só da etapa 9 (2026-10-09-briefing-sem-insert-anonimo.sql): devolve o
-- INSERT anônimo em briefings e ecommerce_briefings. Só faz sentido se as páginas
-- voltarem a gravar direto pelo REST (versão anterior de briefing/, briefing-ecommerce/
-- e briefing-solarium/). Ordem em produção: páginas anteriores → este script.
-- A edge briefing-submit nova pode ficar: o caminho com token não mudou.
begin;
grant insert on table public.briefings to anon;
grant insert on table public.ecommerce_briefings to anon, authenticated;
grant usage on sequence public.briefings_numero_seq, public.ecommerce_briefings_numero_seq to anon, authenticated;
alter policy "anon insere briefing" on public.briefings with check (true);
alter policy "anon insert ecommerce_briefings" on public.ecommerce_briefings with check (true);
commit;
