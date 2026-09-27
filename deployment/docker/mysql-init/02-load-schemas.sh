#!/bin/sh
# Sourced by the MySQL image when the file is not executable.
# A subshell keeps set -e from changing the entrypoint shell.
(
  set -eu
  SCHEMA_DIR="/docker-entrypoint-schemas"
  APP_DB="${MYSQL_DATABASE:-pulseiq}"

  if [ -z "${MYSQL_ROOT_PASSWORD:-}" ]; then
    echo "[beacyn-init] MYSQL_ROOT_PASSWORD is required." >&2
    exit 1
  fi

  for schema in pulseiq_schema.sql bsa_schema.sql; do
    if [ ! -f "${SCHEMA_DIR}/${schema}" ]; then
      echo "[beacyn-init] Missing ${SCHEMA_DIR}/${schema}" >&2
      exit 1
    fi
  done

  echo "[beacyn-init] Importing ${APP_DB} schema..."
  mysql -u root -p"${MYSQL_ROOT_PASSWORD}" "$APP_DB" < "${SCHEMA_DIR}/pulseiq_schema.sql"

  echo "[beacyn-init] Importing bsa schema..."
  mysql -u root -p"${MYSQL_ROOT_PASSWORD}" bsa < "${SCHEMA_DIR}/bsa_schema.sql"

  echo "[beacyn-init] Schema import complete."
) || exit 1
