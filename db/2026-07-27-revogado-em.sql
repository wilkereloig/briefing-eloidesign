-- D7: revogação manual de links permanentes (?t=). Aditiva: links vivos
-- nascem com NULL = válidos. Sem expiração automática (decisão explícita).
alter table orcamentos     add column if not exists revogado_em timestamptz;
alter table briefing_links add column if not exists revogado_em timestamptz;
