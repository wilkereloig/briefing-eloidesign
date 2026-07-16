-- db/portal-cliente.sql (proposto, NAO aplicado)
-- Fonte: docs/painel-admin-unificado/addendum-area-cliente.md, secao "Modelo de dados"
-- Idempotente (IF NOT EXISTS em tudo) -- seguro rodar mais de uma vez.

-- 1. senha do portal: hash + prefixo, nunca texto puro
alter table public.eloi_clientes
  add column if not exists portal_senha_prefix     text unique,        -- 4 chars, indice de busca, NAO secreto
  add column if not exists portal_senha_hash        text,               -- "pbkdf2$<iter>$<salt_b64>$<hash_b64>"
  add column if not exists portal_senha_gerada_em   timestamptz,
  add column if not exists portal_tentativas_falhas integer not null default 0,
  add column if not exists portal_bloqueado_ate     timestamptz,
  add column if not exists portal_ativo             boolean not null default true; -- kill-switch sem apagar a senha

-- 2. cliente_id nas 2 tabelas que hoje so tem texto livre ("cliente"/"empresa")
-- (idempotente -- pode ja ter sido adicionado por orcamentos.ts/briefing-links.ts via ALTER TABLE ad-hoc; duplicar aqui nao tem problema)
alter table public.orcamentos      add column if not exists cliente_id uuid references public.eloi_clientes(id);
alter table public.briefing_links  add column if not exists cliente_id uuid references public.eloi_clientes(id);
create index if not exists orcamentos_cliente_id_idx     on public.orcamentos(cliente_id);
create index if not exists briefing_links_cliente_id_idx on public.briefing_links(cliente_id);

-- 3. sessao do portal -- mesmo padrao de token hex que briefing_links.token ja usa
create table if not exists public.portal_sessions (
  token        text primary key default encode(extensions.gen_random_bytes(24), 'hex'),
  cliente_id   uuid not null references public.eloi_clientes(id) on delete cascade,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at   timestamptz not null default (now() + interval '12 hours') -- sliding, mesmo espirito do admin_sessions do plano de admin
);
alter table public.portal_sessions enable row level security; -- sem policy: so a service-role (edge function) acessa

-- 4. throttle por IP -- defende contra scan de prefixo, nao so contra 1 conta
create table if not exists public.portal_login_ip_attempts (
  id bigint generated always as identity primary key,
  ip text not null,
  attempted_at timestamptz not null default now()
);
alter table public.portal_login_ip_attempts enable row level security;
-- ponytail: sem indice/cleanup -- volume de hoje (1 cliente) nao pesa a tabela.
-- Se crescer: index (ip, attempted_at) + cron apagando linhas com >24h.

-- NAO incluido aqui (fora de escopo desta function): bucket "entregas-marca" -- marca e publica, sem auth, ver addendum.
