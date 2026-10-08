-- Registro retroativo (escrito em 2026-10-09): a coluna texto `sub_cliente`
-- foi criada em produção em jul/2026 por migração aplicada fora do repositório
-- (histórico `create_eloi_gestao_tables`/`eloi_gestao_fase1`). A migração
-- 2026-09-03-sub-clientes-e-nota-1n.sql depende dela. Idempotente: em produção
-- é no-op; serve para recriar o schema em homologação.
alter table public.eloi_servicos add column if not exists sub_cliente text;
