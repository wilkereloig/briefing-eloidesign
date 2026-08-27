-- Throttle do login administrativo passa a ser POR IP.
--
-- Antes: admin_login_seguranca (2026-07-30) guardava um contador único e a 5ª
-- falha bloqueava o login por 15 minutos. Como a edge function admin-auth
-- responde a qualquer requisição da internet e o CORS era "*", isso funcionava
-- como um botão público de derrubar o painel: cinco POSTs com senha errada, de
-- qualquer lugar, e o dono ficava de fora por 15 minutos — de novo a cada cinco
-- POSTs. Bloqueio por IP barra a força bruta sem trancar quem sabe a senha.
--
-- Mesmo desenho de portal_login_ip_attempts (portal-cliente.sql): a tentativa é
-- registrada ANTES da validação, para não existir caminho de "senha certa" que
-- escape da contagem.

create table if not exists public.admin_login_ip_attempts (
  id bigserial primary key,
  ip text not null,
  attempted_at timestamptz not null default now()
);

-- Consulta 1: quantas tentativas deste IP na janela.
create index if not exists admin_login_ip_attempts_ip_idx
  on public.admin_login_ip_attempts (ip, attempted_at desc);
-- Consulta 2: quantas tentativas no total na janela (rede de segurança global).
create index if not exists admin_login_ip_attempts_janela_idx
  on public.admin_login_ip_attempts (attempted_at desc);

-- Sem policies: só service_role (edge function) acessa, igual admin_sessions.
alter table public.admin_login_ip_attempts enable row level security;

comment on table public.admin_login_ip_attempts is
  'Tentativas de login em /admin, por IP. Escrita pela edge admin-auth antes de validar a senha. A própria function faz faxina do que passa de 24h em todo login bem-sucedido.';

comment on table public.admin_login_seguranca is
  'OBSOLETA desde 2026-08-07. O throttle do login admin virou admin_login_ip_attempts (por IP); nenhuma edge function lê ou escreve mais aqui. Mantida por ora só para não perder o registro do último bloqueio. Condição de saída: drop table depois de 2026-09, se ninguém sentir falta.';
