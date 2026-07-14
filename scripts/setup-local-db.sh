#!/usr/bin/env bash
# ============================================================================
# QA DB local: espeja el esquema + catálogo de Supabase (proyecto de prod) en
# un Postgres local, para probar TODO en local con garantía de parity.
#
#   Uso:  bash scripts/setup-local-db.sh
#
# Requisitos: Postgres local (brew postgresql@18), pg_dump/psql en PATH, y
# backend/.env con DATABASE_URL del proyecto Supabase real (sbqcn...).
#
# El esquema/seed se sacan del PROYECTO REAL (no de migraciones replayeadas),
# así lo que funcione en local funciona en Supabase. Solo se siembran tablas de
# REFERENCIA (catálogo/rulesets), NUNCA datos de usuarios.
#
# Después:
#   DATABASE_URL="postgresql://$USER@localhost:5432/entrenaconia_local" \
#     npm run dev:backend        # backend contra la BD local
# ============================================================================
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
DUMP_DIR="$REPO/scripts/.local-db"       # gitignored
LOCAL_DB="${LOCAL_DB:-entrenaconia_local}"
mkdir -p "$DUMP_DIR"

# Conexión de sesión al proyecto Supabase real (session pooler, puerto 5432;
# el pooler de transacción :6543 NO sirve para pg_dump).
eval "$(node -e "
require('$REPO/backend/node_modules/dotenv').config({ path: '$REPO/backend/.env' });
const u = new URL(process.env.DATABASE_URL);
console.log('export SB_HOST=' + JSON.stringify(u.hostname));
console.log('export SB_USER=' + JSON.stringify(decodeURIComponent(u.username)));
console.log('export SB_PASS=' + JSON.stringify(decodeURIComponent(u.password)));
")"
export PGPASSWORD="$SB_PASS"
SB_CONN="host=$SB_HOST port=5432 dbname=postgres user=$SB_USER sslmode=require"

echo "▶ 1/4 Dump de esquema (app + public) desde Supabase…"
pg_dump "$SB_CONN" --schema-only --no-owner --no-privileges --no-acl \
  -n app -n public -f "$DUMP_DIR/schema.sql"

echo "▶ 2/4 Dump de catálogo (referencia, sin datos de usuario)…"
pg_dump "$SB_CONN" --data-only --no-owner --no-privileges \
  -t app.ejercicios \
  -t 'app."Ejercicios_CrossFit"' -t 'app."Ejercicios_Bomberos"' \
  -t 'app."Ejercicios_Guardia_Civil"' -t 'app."Ejercicios_Policia_Nacional"' \
  -t 'app."Ejercicios_Policia_Local"' -t app.mindfeed_rulesets \
  -f "$DUMP_DIR/seed.sql"

echo "▶ 3/4 (Re)creando BD local '$LOCAL_DB'…"
unset PGPASSWORD
dropdb --if-exists "$LOCAL_DB"
createdb "$LOCAL_DB"
psql -d "$LOCAL_DB" -q -c 'CREATE EXTENSION IF NOT EXISTS pgcrypto; CREATE EXTENSION IF NOT EXISTS "uuid-ossp";'
# Rol de Supabase referenciado por los GRANT del dump (no crítico para QA).
psql -d "$LOCAL_DB" -q -c "DO \$\$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END \$\$;"

echo "▶ 4/4 Cargando esquema + catálogo…"
psql -d "$LOCAL_DB" -v ON_ERROR_STOP=0 -f "$DUMP_DIR/schema.sql" >/dev/null 2>"$DUMP_DIR/schema-errors.log" || true
psql -d "$LOCAL_DB" -v ON_ERROR_STOP=0 -f "$DUMP_DIR/seed.sql"   >/dev/null 2>"$DUMP_DIR/seed-errors.log"   || true

echo ""
echo "✅ Mirror local listo en BD '$LOCAL_DB':"
psql -d "$LOCAL_DB" -tAc "SELECT '   tablas app='||(SELECT count(*) FROM information_schema.tables WHERE table_schema='app')||' | funciones='||(SELECT count(*) FROM information_schema.routines WHERE routine_schema='app')||' | ejercicios='||(SELECT count(*) FROM app.ejercicios)"
echo ""
echo "Arranca el backend contra la BD local con:"
echo "  DATABASE_URL=\"postgresql://\$USER@localhost:5432/$LOCAL_DB\" npm run dev:backend"
