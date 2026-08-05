-- Design do painel novo pede "Vincular cliente" em respostas legadas (sem
-- token) — as duas tabelas legadas nunca tiveram esse vínculo. Aditiva.
alter table public.briefings add column if not exists cliente_id uuid references public.eloi_clientes(id);
alter table public.ecommerce_briefings add column if not exists cliente_id uuid references public.eloi_clientes(id);
