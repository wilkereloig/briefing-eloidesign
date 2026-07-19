-- db/eloi-materiais.sql
-- Fase 7: metadados de arquivos/entregas. Arquivos antigos (listagem direta do
-- bucket eloi-entregas) continuam funcionando; esta tabela cobre materiais novos
-- com título/versão/status de publicação. RLS ligado sem policy — service role só.

create table if not exists public.eloi_materiais (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.eloi_clientes(id),
  servico_id uuid references public.eloi_servicos(id),
  titulo text not null,
  descricao text,
  categoria text not null default 'arquivo'
    check (categoria in ('arquivo','apresentacao','fonte','nota_fiscal','outro')),
  versao integer not null default 1,
  path text not null,
  status text not null default 'rascunho'
    check (status in ('rascunho','publicado','arquivado')),
  created_at timestamptz not null default now(),
  published_at timestamptz
);
alter table public.eloi_materiais enable row level security;

create index if not exists eloi_materiais_cliente_idx on public.eloi_materiais(cliente_id);
