-- Etapa 9: o briefing aberto (sem token de link) passa pela edge briefing-submit,
-- com o mesmo limite por IP do caminho com token. As páginas deixaram de gravar
-- direto pelo REST com a chave pública; aqui fecha a porta que elas usavam.
--
-- Publicar SÓ DEPOIS de a edge e as páginas novas estarem no ar. Página antiga em
-- cache que ainda tente o REST recebe 401 do Supabase — a resposta não se perde:
-- o backup Formspree é enviado antes e independe do banco.
--
-- Sem `drop` (o MCP do Supabase trava nessa palavra): a política fica, mas não
-- aceita mais nada; o privilégio de tabela sai. Reversão: reverter-2026-10-09-etapa9.sql.

revoke all on table public.briefings, public.ecommerce_briefings from anon, authenticated;
revoke all on sequence public.briefings_numero_seq, public.ecommerce_briefings_numero_seq from anon, authenticated;

do $$
begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'briefings' and policyname = 'anon insere briefing') then
    alter policy "anon insere briefing" on public.briefings with check (false);
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ecommerce_briefings' and policyname = 'anon insert ecommerce_briefings') then
    alter policy "anon insert ecommerce_briefings" on public.ecommerce_briefings with check (false);
  end if;
end $$;
