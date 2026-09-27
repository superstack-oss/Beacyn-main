#!/bin/sh
# Beacyn container bootstrap.
# 1. Validate configuration
# 2. Wait until MySQL accepts connections
# 3. Apply the idempotent schema
# 4. Replace this shell with the platform launcher
set -eu

CYAN='\033[0;36m'
GRN='\033[0;32m'
YEL='\033[0;33m'
RED='\033[0;31m'
RST='\033[0m'

log()  { printf "${CYAN}[beacyn]${RST} %s\n" "$*"; }
ok()   { printf "${GRN}[beacyn]${RST} %s\n" "$*"; }
warn() { printf "${YEL}[beacyn]${RST} %s\n" "$*"; }
err()  { printf "${RED}[beacyn]${RST} %s\n" "$*" >&2; }

cd /app

: "${DB_HOST:?DB_HOST is required}"
: "${DB_NAME:?DB_NAME is required}"
DB_PORT="${DB_PORT:-3306}"
DB_USER="${DB_USER:-root}"
DB_PASSWORD="${DB_PASSWORD:-${MYSQL_ROOT_PASSWORD:-Password@123}}"
export DB_USER DB_PASSWORD DB_PORT

case "$DB_PORT" in
  ''|*[!0-9]*) err "DB_PORT must be a number."; exit 1 ;;
esac

if [ "$DB_PASSWORD" = "Password@123" ]; then
  warn "MySQL is using the default password. Set MYSQL_ROOT_PASSWORD before production use."
fi

if [ ! -f /app/dist/index.html ]; then
  err "Frontend build artefacts not found at /app/dist."
  err "Rebuild with: docker compose build   or   podman compose build"
  exit 1
fi

log "Waiting for MySQL at ${DB_HOST}:${DB_PORT}…"
MAX_TRIES=40
TRIES=0
LAST_ERR=""
while true; do
  if LAST_ERR="$(node --input-type=module -e "
    import mysql from 'mysql2/promise';
    const conn = await mysql.createConnection({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      connectTimeout: 5000,
    });
    await conn.end();
  " 2>&1)"; then
    break
  fi
  TRIES=$((TRIES + 1))
  if [ "$TRIES" -ge "$MAX_TRIES" ]; then
    err "MySQL did not become ready after ${MAX_TRIES} attempts."
    [ -n "$LAST_ERR" ] && err "$LAST_ERR"
    exit 1
  fi
  warn "MySQL not ready (attempt ${TRIES}/${MAX_TRIES}). Retrying in 3s…"
  sleep 3
done
ok "MySQL is ready."

log "Applying database schema (idempotent)…"
if ! node_modules/.bin/tsx db/initDb.ts; then
  err "Database initialisation failed."
  exit 1
fi
ok "Database schema is up to date."

ok "Starting Beacyn (NODE_ENV=${NODE_ENV:-production})…"
exec node_modules/.bin/tsx src/scripts/start.ts
