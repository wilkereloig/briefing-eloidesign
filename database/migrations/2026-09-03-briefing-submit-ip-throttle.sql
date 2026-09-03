-- Throttle por IP no envio público de briefing (edge briefing-submit).
--
-- Até aqui o endpoint aceitava qualquer volume: varredura de token e reenvio
-- em massa custavam uma leitura no banco cada, sem limite. Tabela própria —
-- não reaproveita portal_login_ip_attempts porque envio de briefing e login
-- do portal têm limites diferentes e um não pode trancar o outro.
--
-- Mesmo desenho de admin_login_ip_attempts (2026-08-07): a tentativa é
-- registrada ANTES da validação; a própria function faz faxina do que passa
-- de 24h em todo envio bem-sucedido.

create table if not exists public.briefing_submit_ip_attempts (
  id bigserial primary key,
  ip text not null,
  attempted_at timestamptz not null default now()
);

create index if not exists briefing_submit_ip_attempts_ip_idx
  on public.briefing_submit_ip_attempts (ip, attempted_at desc);

-- Sem policies: só service_role (edge function) acessa.
alter table public.briefing_submit_ip_attempts enable row level security;

comment on table public.briefing_submit_ip_attempts is
  'Envios de briefing por token, por IP. Escrita pela edge briefing-submit antes de validar o token. Faxina de >24h a cada envio bem-sucedido.';
