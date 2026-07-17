-- db/orcamento-servico-bridge.sql
-- Fase 1 do reorganizacao do painel: liga orcamento aprovado -> eloi_servicos,
-- sem redigitar cliente/descricao/valor a mao. Idempotente.

alter table public.eloi_servicos add column if not exists orcamento_id uuid references public.orcamentos(id);

-- 1 orcamento vira no maximo 1 servico (null permitido em varias linhas -- servicos criados a mao continuam null).
create unique index if not exists eloi_servicos_orcamento_id_uidx
  on public.eloi_servicos(orcamento_id) where orcamento_id is not null;

-- novo estado intermediario: aprovado mas ainda nao comecou a execucao.
alter table public.eloi_servicos drop constraint if exists eloi_servicos_status_execucao_check;
alter table public.eloi_servicos add constraint eloi_servicos_status_execucao_check
  check (status_execucao in ('aguardando_inicio','em_execucao','concluida'));
