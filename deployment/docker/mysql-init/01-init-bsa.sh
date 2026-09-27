#!/bin/sh
# =============================================================================
# 01-init-bsa.sh — Beacyn MySQL initialisation: agent infrastructure database
#
# Runs automatically on the FIRST start of beacyn-mysql-1.0 (when the data
# volume is empty).  It is safe to replay — all statements are idempotent.
#
# Purpose:
#   docker-compose creates `pulseiq` via MYSQL_DATABASE and creates the
#   application user (MYSQL_USER) with access to that database only.
#   This script creates the `bsa` database (agent telemetry) and grants the
#   application user full access to both databases.
# =============================================================================
set -e

# MYSQL_ROOT_PASSWORD is injected by the MySQL Docker image.
# The app connects as root; root already has all privileges so no extra GRANTs
# are needed — only the bsa database needs to be created.
mysql -u root -p"${MYSQL_ROOT_PASSWORD}" <<SQL
-- Agent infrastructure database (telemetry, health events, disk metrics, etc.)
CREATE DATABASE IF NOT EXISTS \`bsa\`
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

-- Ensure root can connect from any host (app container → db container)
GRANT ALL PRIVILEGES ON *.* TO 'root'@'%' WITH GRANT OPTION;
FLUSH PRIVILEGES;
SQL

echo "[beacyn-init] bsa database created. root@'%' access confirmed."
