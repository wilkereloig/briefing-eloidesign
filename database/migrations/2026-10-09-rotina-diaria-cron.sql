-- 2026-10-09 · Rotina diária do financeiro no pg_cron: gera as contas fixas e
-- atualiza "vencido" pela data, sem depender de alguém abrir o painel.
-- Roda SQL direto (eloi_rotina_diaria), sem HTTP nem chave.
-- 09:05 UTC = 06:05 em Brasília. Idempotente: reagendar substitui o job.
-- ⚠️ Produção: aplicar só depois de 2026-10-09-liquidacoes-e-operacoes-atomicas.sql
--    e com autorização. Em homologação sem pg_cron é no-op.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'eloi-rotina-diaria';
    perform cron.schedule('eloi-rotina-diaria', '5 9 * * *', 'select public.eloi_rotina_diaria()');
  else
    raise notice 'pg_cron ausente: rotina diária não agendada (ok em homologação)';
  end if;
end $$;
