#!/usr/bin/env bash
# Recria o banco de HOMOLOGAÇÃO num Postgres local a partir das migrações.
# Uso: PGHOST=/tmp PGPORT=54329 PGUSER=postgres database/homologacao/recriar.sh [nome_db]
# Nunca aponte para o Supabase real.
set -euo pipefail
cd "$(dirname "$0")/.."
DB="${1:-homolog}"
case "${PGHOST:-}" in *supabase*) echo "recusado: PGHOST aponta para o Supabase"; exit 1;; esac
psql -v ON_ERROR_STOP=1 -q -d postgres -c "drop database if exists $DB" -c "create database $DB"
sed "s/alter database homolog/alter database $DB/" homologacao/stubs-supabase.sql | psql -v ON_ERROR_STOP=1 -q -d "$DB"
for f in $(grep -v '^#' homologacao/ordem.txt); do
  PGOPTIONS='-c search_path=public,extensions -c client_min_messages=warning' psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "migrations/$f" >/dev/null
done
echo "schema recriado em $DB"
