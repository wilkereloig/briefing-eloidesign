-- Documento fiscal do cliente (tomador da nota) e chave de acesso da NFS-e.
-- Cliente do painel (ex.: marca) pode faturar por uma razão social/CNPJ diferente do nome;
-- a nota precisa guardar quem é o tomador e a chave pra conferência depois.
-- Puramente aditiva. Os valores vivem só no banco.
alter table public.eloi_clientes
  add column if not exists documento text,
  add column if not exists razao_social text;
alter table public.eloi_notas_fiscais
  add column if not exists chave_acesso text;
create unique index if not exists eloi_notas_fiscais_chave_unica
  on public.eloi_notas_fiscais (chave_acesso) where chave_acesso is not null;
comment on column public.eloi_clientes.documento is 'CNPJ/CPF usado pra faturar (tomador da NFS-e). Só dígitos.';
comment on column public.eloi_clientes.razao_social is 'Razão social do tomador quando difere do nome do cliente.';
comment on column public.eloi_notas_fiscais.chave_acesso is 'Chave de acesso da NFS-e (50 dígitos), pra conferir no portal nacional.';
