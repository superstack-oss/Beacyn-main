#!/bin/sh
# =============================================================================
# docker-entrypoint.sh — Beacyn container bootstrap
#
# Sequence:
#   1. Wait for MySQL to be reachable   (handled by compose healthcheck /
#      depends_on service_healthy — this is a belt-and-suspenders guard)
#   2. Initialise / migrate the database schema  (idempotent)
#   3. Hand off to the platform launcher  (tsx src/scripts/start.ts)
#
# Environment variables are injected by docker-compose.yml.
# EULA_ACCEPTED=true and NODE_ENV=production are set in the Dockerfile.
# =============================================================================
set -e

CYAN='\033[0;36m'
GRN='\033[0;32m'
YEL='\033[0;33m'
RED='\033[0;31m'
RST='\033[0m'

log()  { printf "${CYAN}[beacyn]${RST} %s\n" "$*"; }
ok()   { printf "${GRN}[beacyn]${RST} %s\n" "$*"; }
warn() { printf "${YEL}[beacyn]${RST} %s\n" "$*"; }
err()  { printf "${RED}[beacyn]${RST} %s\n" "$*" >&2; }

# ── Validate required environment variables ───────────────────────────────────
: "${DB_HOST:?DB_HOST is required}"
: "${DB_NAME:?DB_NAME is required}"
# DB_USER and DB_PASSWORD are always root / MYSQL_ROOT_PASSWORD in the Docker setup
DB_USER="${DB_USER:-root}"
DB_PASSWORD="${DB_PASSWORD:-${MYSQL_ROOT_PASSWORD:-Password@123}}"
export DB_USER DB_PASSWORD

# ── Verify the built frontend exists ─────────────────────────────────────────
if [ ! -d "/app/dist" ] || [ -z "$(ls -A /app/dist 2>/dev/null)" ]; then
  err "Frontend build artefacts not found at /app/dist."
  err "Rebuild the image with: docker compose build"
  exit 1
fi

# ── Wait for MySQL (belt-and-suspenders beyond compose healthcheck) ───────────
log "Waiting for MySQL at ${DB_HOST}:${DB_PORT:-3306}…"
MAX_TRIES=30
TRIES=0
until node -e "
  const mysql = require('mysql2/promise');
  mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  }).then(c => c.end()).then(() => process.exit(0)).catch(() => process.exit(1));
" 2>/dev/null; do
  TRIES=$((TRIES + 1))
  if [ "$TRIES" -ge "$MAX_TRIES" ]; then
    err "MySQL did not become ready after ${MAX_TRIES} attempts. Aborting."
    exit 1
  fi
  warn "MySQL not ready yet (attempt ${TRIES}/${MAX_TRIES}) — retrying in 3 s…"
  sleep 3
done
ok "MySQL is ready."

# ── Initialise / migrate database schema ─────────────────────────────────────
log "Running database initialisation (idempotent)…"
node_modules/.bin/tsx db/initDb.ts
ok "Database schema is up to date."

# ── Launch the Beacyn platform ────────────────────────────────────────────────
ok "Starting Beacyn platform (NODE_ENV=${NODE_ENV})…"
exec node_modules/.bin/tsx src/scripts/start.ts
