-- Etapa 9: briefing aberto só entra pela edge (service_role). A chave pública
-- (anon/authenticated) não grava, não lê e não apaga briefing.
\set ON_ERROR_STOP 1
create or replace function pg_temp.afirma(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond, false) then raise exception 'FALHOU: %', msg; end if; raise notice 'ok: %', msg; end $$;

select pg_temp.afirma(not has_table_privilege('anon', 'public.briefings', 'insert'), 'anon não insere em briefings');
select pg_temp.afirma(not has_table_privilege('anon', 'public.ecommerce_briefings', 'insert'), 'anon não insere em ecommerce_briefings');
select pg_temp.afirma(not has_table_privilege('authenticated', 'public.ecommerce_briefings', 'insert'), 'authenticated não insere em ecommerce_briefings');
select pg_temp.afirma(not has_table_privilege('anon', 'public.briefings', 'select,update,delete,truncate'), 'anon sem nenhum outro privilégio em briefings');
select pg_temp.afirma(not exists (select 1 from pg_policies where tablename in ('briefings', 'ecommerce_briefings') and with_check <> 'false'),
  'nenhuma política de insert aceita linha');
select pg_temp.afirma(has_table_privilege('service_role', 'public.briefings', 'insert')
  and has_table_privilege('service_role', 'public.ecommerce_briefings', 'insert'), 'edge (service_role) continua gravando');

-- a linha que a edge monta (_shared/briefing.ts) entra nas duas tabelas
set role service_role;
insert into public.briefings (raw, nome, email, q1) values ('{"nome":"Teste"}', 'Teste', 't@exemplo.test', 'Loja');
insert into public.ecommerce_briefings (nome, email, whatsapp, empresa, raw) values ('Teste', null, null, 'Loja X', '{"nome":"Teste"}');
reset role;
select pg_temp.afirma((select count(*) from public.briefings where email = 't@exemplo.test') = 1, 'briefing aberto gravado pela edge');

set role anon;
do $$ begin
  insert into public.briefings (raw) values ('{}');
  raise exception 'FALHOU: anon gravou briefing';
exception when insufficient_privilege then raise notice 'ok: insert anônimo recusado (%)', sqlerrm;
end $$;
reset role;
