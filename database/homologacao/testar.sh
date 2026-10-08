#!/usr/bin/env bash
# Testes de integração do banco em HOMOLOGAÇÃO (Postgres local, dados sintéticos).
# Recria o schema até a migração anterior à de liquidações, semeia dados no formato legado,
# aplica a migração nova (testando o backfill) e roda as afirmações.
set -euo pipefail
cd "$(dirname "$0")/.."
DB=homolog_teste
case "${PGHOST:-}" in *supabase*) echo "recusado"; exit 1;; esac
ULTIMA=2026-10-09-liquidacoes-e-operacoes-atomicas.sql
sed "/^#/d" homologacao/ordem.txt | sed "/^$ULTIMA$/,\$d" > /tmp/ordem-ate-anterior.txt
psql -v ON_ERROR_STOP=1 -q -d postgres -c "drop database if exists $DB" -c "create database $DB"
sed "s/alter database homolog/alter database $DB/" homologacao/stubs-supabase.sql | psql -v ON_ERROR_STOP=1 -q -d "$DB"
export PGOPTIONS='-c search_path=public,extensions -c client_min_messages=warning'
while read -r f; do psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "migrations/$f" >/dev/null; done < /tmp/ordem-ate-anterior.txt
psql -v ON_ERROR_STOP=1 -q -d "$DB" -f homologacao/testes/00-semente-legado.sql
psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "migrations/$ULTIMA"
sed "/^#/d" homologacao/ordem.txt | sed -n "/^$ULTIMA$/,\$p" | tail -n +2 | while read -r f; do
  psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "migrations/$f" >/dev/null; done
export PGOPTIONS='-c search_path=public,extensions -c client_min_messages=notice'
for t in homologacao/testes/[1-9]*.sql; do echo "== $t"; psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$t" 2>&1 | grep -E 'ok:|FALHOU|ERROR' ; done
echo "== concorrência"
bash homologacao/testes/concorrencia.sh "$DB"
