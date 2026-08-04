-- Porta o lockout que portal-cliente.ts já tem (5 tentativas -> 15min) pro
-- login admin, que hoje não tem limite nenhum. 1 admin para sempre (D3) =
-- 1 linha global, não por usuário (o padrão "singleton row" do Postgres:
-- id boolean + check garante no máximo 1 linha).
create table if not exists public.admin_login_seguranca (
  id boolean primary key default true check (id),
  tentativas_falhas int not null default 0,
  bloqueado_ate timestamptz
);
insert into public.admin_login_seguranca (id) values (true) on conflict (id) do nothing;

-- sem policies: só service-role (edge functions) acessa, igual admin_sessions.
alter table public.admin_login_seguranca enable row level security;
