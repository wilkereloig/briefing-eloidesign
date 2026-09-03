-- Documenta em migração as três colunas de ajuste de `orcamentos`.
--
-- `complexidade`, `urgencia` e `desconto_pct` existem em produção desde algum
-- ALTER TABLE feito à mão: nenhuma migração as criou. `orcamentos.ts` lê e
-- grava as três, e `assets/eloi-admin/orcamento.js` calcula com elas — mas um
-- clone limpo do banco não teria nenhuma, e a proposta quebraria sem sinal.
--
-- Idempotente: em produção não muda nada (as colunas já existem com estes
-- defaults, conferidos em 2026-09-03). O que este arquivo acrescenta de fato é
-- a CHECK — hoje o banco aceita qualquer string, e a validação vive só na edge.
--
-- Também não há CHECK em `status`: fica como está de propósito. Um `expirado`
-- gravado precisaria de alguém para virar a chave na data certa; expirado é
-- derivado de `updated_at` em `app/src/domain/orcamento.ts`.

alter table public.orcamentos
  add column if not exists complexidade text not null default 'simples',
  add column if not exists urgencia     text not null default 'normal',
  add column if not exists desconto_pct numeric not null default 0;

alter table public.orcamentos drop constraint if exists orcamentos_complexidade_check;
alter table public.orcamentos add constraint orcamentos_complexidade_check
  check (complexidade in ('simples', 'media', 'alta'));

alter table public.orcamentos drop constraint if exists orcamentos_urgencia_check;
alter table public.orcamentos add constraint orcamentos_urgencia_check
  check (urgencia in ('normal', 'expressa'));

alter table public.orcamentos drop constraint if exists orcamentos_desconto_check;
alter table public.orcamentos add constraint orcamentos_desconto_check
  check (desconto_pct >= 0 and desconto_pct <= 100);

comment on column public.orcamentos.complexidade is
  'Multiplicador do cálculo: simples 1,0 · media 1,4 · alta 1,8. Tabela em app/src/domain/orcamento.ts.';
comment on column public.orcamentos.urgencia is
  'Multiplicador do cálculo: normal 1,0 · expressa 1,3.';
comment on column public.orcamentos.desconto_pct is
  'Percentual aplicado depois dos multiplicadores. 0 a 100.';
