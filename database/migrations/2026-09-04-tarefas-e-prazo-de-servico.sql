-- Tarefas leves e prazo de serviço.
--
-- TAREFAS: camada mínima de "preciso lembrar de fazer X". Não é gestor de
-- projeto: sem subtarefa, sem responsável (quem opera é uma pessoa), sem
-- comentário. Pendência automática do sistema ("serviço sem NF") NÃO vira
-- linha aqui — é derivada em domain/decisoes.ts. Duas fontes da mesma
-- pendência divergiriam na primeira mudança.
--
-- PRAZO: eloi_servicos não tinha data de entrega combinada. "Serviço
-- atrasado" era impossível de detectar e o calendário não tinha prazo de
-- projeto para mostrar. data_competencia é a que mês pertence — outra coisa.

alter table public.eloi_servicos
  add column if not exists prazo date;
comment on column public.eloi_servicos.prazo is
  'Data de entrega combinada. Nulo = sem prazo. Atrasado = prazo < hoje e não concluída (derivado, não gravado).';

create table if not exists public.eloi_tarefas (
  id             uuid primary key default gen_random_uuid(),
  titulo         text not null,
  prazo          date,
  status         text not null default 'aberta'
                 check (status in ('aberta', 'em_andamento', 'concluida', 'cancelada')),
  prioridade     text not null default 'normal'
                 check (prioridade in ('baixa', 'normal', 'alta')),
  cliente_id     uuid references public.eloi_clientes(id) on delete set null,
  sub_cliente_id uuid references public.eloi_sub_clientes(id) on delete set null,
  servico_id     uuid references public.eloi_servicos(id) on delete set null,
  observacoes    text,
  concluida_em   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Leitura dominante: abertas por prazo (Hoje e calendário).
create index if not exists eloi_tarefas_abertas_idx
  on public.eloi_tarefas (prazo) where status in ('aberta', 'em_andamento');
create index if not exists eloi_tarefas_cliente_idx
  on public.eloi_tarefas (cliente_id);

alter table public.eloi_tarefas enable row level security;
drop policy if exists sem_acesso_anon on public.eloi_tarefas;
create policy sem_acesso_anon on public.eloi_tarefas
  for all to anon, authenticated using (false) with check (false);

comment on table public.eloi_tarefas is
  'Tarefas manuais do dono. Pendências automáticas (sem NF, vencido) são derivadas em domain/decisoes.ts e não entram aqui.';
