-- Impressão digital do schema por tabela (colunas, tipos, nulidade, default,
-- constraints, índices). Rodar igual em produção e em homologação e comparar.
with cols as (
  select c.table_name t, string_agg(c.column_name||':'||c.udt_name||':'||c.is_nullable||':'||coalesce(c.column_default,''), ',' order by c.column_name) s
  from information_schema.columns c where c.table_schema='public' and c.table_name in (select tablename from pg_tables where schemaname='public') group by 1),
cons as (
  select cl.relname t, string_agg(con.conname||'='||pg_get_constraintdef(con.oid), ',' order by con.conname) s
  from pg_constraint con join pg_class cl on cl.oid=con.conrelid join pg_namespace n on n.oid=cl.relnamespace where n.nspname='public' group by 1),
idx as (
  select tablename t, string_agg(indexdef, ',' order by indexname) s from pg_indexes where schemaname='public' group by 1),
pol as (
  select tablename t, string_agg(policyname||':'||cmd||':'||roles::text||':'||coalesce(qual,'')||':'||coalesce(with_check,''), ',' order by policyname) s from pg_policies where schemaname='public' group by 1),
trg as (
  select event_object_table t, string_agg(distinct trigger_name||':'||action_timing||':'||event_manipulation, ',') s from information_schema.triggers where trigger_schema='public' group by 1)
select cols.t tabela, left(md5(cols.s),8) col, left(md5(coalesce(cons.s,'')),8) con, left(md5(coalesce(idx.s,'')),8) idx, left(md5(coalesce(pol.s,'')),8) pol, left(md5(coalesce(trg.s,'')),8) trg
from cols left join cons using (t) left join idx using (t) left join pol using (t) left join trg using (t)
where cols.t like 'eloi\_%' or cols.t in ('orcamentos','briefings','ecommerce_briefings','briefing_links','catalogo_servicos','admin_sessions','admin_login_seguranca','admin_login_ip_attempts','portal_sessions','portal_login_ip_attempts','briefing_submit_ip_attempts')
order by 1;
