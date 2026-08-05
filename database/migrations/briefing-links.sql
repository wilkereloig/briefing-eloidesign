-- Documentação — já existe em produção (não recriar, só documentar)
create table if not exists public.briefing_links (
  id           uuid primary key default gen_random_uuid(),
  token        text not null unique default encode(extensions.gen_random_bytes(16), 'hex'),
  cliente      text,
  cliente_id   uuid references public.eloi_clientes(id), -- adicionado no addendum de área de cliente
  tipo         text not null, -- 'briefing' | 'briefing-ecommerce' | 'briefing-solarium' | 'briefing-guia-viver-bem'
  status       text not null default 'pendente',
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  nome         text,
  email        text,
  whatsapp     text,
  empresa      text,
  raw          jsonb
);
alter table public.briefing_links enable row level security;
create index if not exists briefing_links_cliente_id_idx on public.briefing_links(cliente_id);
