#!/bin/sh
set -e

echo "[beacyn-init] Importing pulseiq schema..."
mysql -u root -p"${MYSQL_ROOT_PASSWORD}" pulseiq < /container-schemas/pulseiq_schema.sql

echo "[beacyn-init] Importing bsa schema..."
mysql -u root -p"${MYSQL_ROOT_PASSWORD}" bsa < /container-schemas/bsa_schema.sql

echo "[beacyn-init] Schema import complete."
