-- Reconciliação do repositório com o schema aplicado em produção (inventário de
-- 2026-10-09, comparação por database/homologacao/fingerprint.sql). Tudo aqui
-- JÁ EXISTE em produção — aplicar lá é no-op. Sem isto, recriar o banco a partir
-- das migrações dá um schema diferente do real.

create index if not exists idx_eloi_categorias_ctx on public.eloi_categorias (contexto, tipo) where ativa;
create index if not exists idx_eloi_nf_status on public.eloi_notas_fiscais (status, competencia);
create index if not exists eloi_servicos_cliente_idx on public.eloi_servicos (cliente_id);
create index if not exists orcamentos_cliente_id_idx on public.orcamentos (cliente_id);
create unique index if not exists uq_eloi_categorias_nome on public.eloi_categorias (lower(nome), contexto, tipo);
create unique index if not exists orcamentos_share_token_idx on public.orcamentos (share_token);

-- Políticas de INSERT anônimo que existem em produção e não estavam em nenhuma
-- migração. Elas CONTRARIAM a regra "RLS nega anon em toda tabela" e estão
-- registradas aqui só para o schema bater; a remoção é decisão da Etapa 9
-- (ver docs/INVENTARIO-2026-10.md, item "briefing direto via REST").
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='briefings' and policyname='anon insere briefing') then
    create policy "anon insere briefing" on public.briefings for insert to anon with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='ecommerce_briefings' and policyname='anon insert ecommerce_briefings') then
    create policy "anon insert ecommerce_briefings" on public.ecommerce_briefings for insert to anon, authenticated with check (true);
  end if;
end $$;
