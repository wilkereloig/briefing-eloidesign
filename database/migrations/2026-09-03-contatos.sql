-- Contatos do cliente e da marca.
--
-- Hoje `eloi_clientes.contato` é um texto livre com "e-mail, WhatsApp ou nome
-- de quem responde" — um campo para três coisas, e só um por cliente. A F2
-- tem uma pessoa por marca; ligar para a errada custa tempo.
--
-- Deliberadamente pequeno: é agenda, não CRM. Sem funil, sem histórico de
-- interação, sem dono do relacionamento — quem opera é uma pessoa só.
--
-- A coluna `eloi_clientes.contato` NÃO sai aqui: `/gestao` e a folha do
-- cliente ainda a leem. Condição de saída: cair junto com `/gestao`.

create table if not exists public.eloi_contatos (
  id             uuid primary key default gen_random_uuid(),
  cliente_id     uuid not null references public.eloi_clientes(id) on delete cascade,
  -- Contato pode ser do cliente inteiro (null) ou de uma marca específica.
  sub_cliente_id uuid references public.eloi_sub_clientes(id) on delete set null,
  nome           text not null,
  funcao         text,
  email          text,
  telefone       text,
  whatsapp       text,
  observacoes    text,
  principal      boolean not null default false,
  ativo          boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Leitura é sempre "contatos deste cliente".
create index if not exists eloi_contatos_cliente_idx
  on public.eloi_contatos (cliente_id, ativo);

-- Um principal por cliente: "quem eu ligo primeiro" só tem uma resposta.
-- Índice parcial em vez de constraint para não travar contato não-principal.
create unique index if not exists eloi_contatos_principal_unico
  on public.eloi_contatos (cliente_id) where principal;

alter table public.eloi_contatos enable row level security;
drop policy if exists sem_acesso_anon on public.eloi_contatos;
create policy sem_acesso_anon on public.eloi_contatos
  for all to anon, authenticated using (false) with check (false);

comment on table public.eloi_contatos is
  'Pessoas de contato do cliente (e opcionalmente de uma marca). Agenda, não CRM. O campo legado eloi_clientes.contato continua existindo até /gestao sair.';
comment on column public.eloi_contatos.principal is
  'Quem procurar primeiro. Índice único parcial garante um por cliente.';
