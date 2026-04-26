-- =============================================================================
-- 01-init-bsa.sql — Beacyn MySQL initialisation: agent infrastructure database
--
-- Runs automatically on the FIRST start of beacyn-mysql-1.0 (when the data
-- volume is empty).  All statements are idempotent — safe to replay.
--
-- Purpose:
--   docker-compose creates `pulseiq` via MYSQL_DATABASE.
--   This script creates the `bsa` database (agent telemetry) and ensures
--   root can connect from the app container (any host).
-- =============================================================================

-- Agent infrastructure database (telemetry, health events, disk metrics, etc.)
CREATE DATABASE IF NOT EXISTS `bsa`
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

-- Allow root to connect from any host (app container → db container)
GRANT ALL PRIVILEGES ON *.* TO 'root'@'%' WITH GRANT OPTION;
FLUSH PRIVILEGES;
