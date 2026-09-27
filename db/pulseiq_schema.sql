-- MySQL dump 10.13  Distrib 8.0.45, for macos15 (arm64)
--
-- Host: localhost    Database: pulseiq
-- ------------------------------------------------------
-- Server version	8.0.45

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `agent_metrics`
--

DROP TABLE IF EXISTS `agent_metrics`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `agent_metrics` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `agent_id` varchar(50) NOT NULL,
  `hostname` varchar(255) NOT NULL,
  `platform` varchar(50) NOT NULL,
  `distro` varchar(120) DEFAULT NULL,
  `os_version` varchar(120) DEFAULT NULL,
  `payload_json` json NOT NULL,
  `collected_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `serial_number` varchar(128) DEFAULT NULL,
  `machine_type` varchar(20) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_agent_metrics_agent_time` (`agent_id`,`collected_at`),
  KEY `idx_agent_metrics_collected` (`collected_at`),
  KEY `idx_agent_metrics_serial_number` (`serial_number`),
  KEY `idx_agent_metrics_machine_type` (`machine_type`)
) ENGINE=InnoDB AUTO_INCREMENT=3102 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `agents`
--

DROP TABLE IF EXISTS `agents`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `agents` (
  `id` varchar(50) NOT NULL,
  `hostname` varchar(255) NOT NULL,
  `os` varchar(100) NOT NULL,
  `os_version` varchar(100) NOT NULL,
  `agent_version` varchar(50) NOT NULL,
  `status` enum('Actively Syncing','Delayed Sync','Offline') DEFAULT 'Delayed Sync',
  `started_at` timestamp NULL DEFAULT NULL,
  `last_heartbeat_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `serial_number` varchar(128) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `ux_agents_serial_number` (`serial_number`),
  KEY `idx_agents_heartbeat` (`last_heartbeat_at`),
  KEY `idx_agents_status` (`status`),
  KEY `idx_agents_serial_number` (`serial_number`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `app_settings`
--

DROP TABLE IF EXISTS `app_settings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `app_settings` (
  `scope_key` varchar(120) NOT NULL,
  `settings_json` json NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`scope_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `assets`
--

DROP TABLE IF EXISTS `assets`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `assets` (
  `id` varchar(50) NOT NULL,
  `name` varchar(255) NOT NULL,
  `parent_type` varchar(100) DEFAULT NULL,
  `sub_type` varchar(100) DEFAULT NULL,
  `target_endpoint` varchar(255) DEFAULT NULL,
  `environment` varchar(50) DEFAULT NULL,
  `status` varchar(50) DEFAULT 'Up',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `last_checked_at` timestamp NULL DEFAULT NULL,
  `last_response_ms` int DEFAULT NULL,
  `ssl_expiry_at` timestamp NULL DEFAULT NULL,
  `domain_expiry_at` timestamp NULL DEFAULT NULL,
  `domain_registrar` varchar(255) DEFAULT NULL,
  `ssl_profile_json` json DEFAULT NULL,
  `first_up_at` timestamp NULL DEFAULT NULL,
  `device_category` varchar(50) DEFAULT NULL,
  `maintenance_window_id` varchar(64) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `data_center_capacity`
--

DROP TABLE IF EXISTS `data_center_capacity`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `data_center_capacity` (
  `dc_id` varchar(64) NOT NULL,
  `building_type` varchar(80) DEFAULT NULL,
  `redundancy_level` varchar(80) DEFAULT NULL,
  `rack_total` int NOT NULL DEFAULT '0',
  `rack_used` int NOT NULL DEFAULT '0',
  `rack_available` int NOT NULL DEFAULT '0',
  `power_capacity` varchar(120) DEFAULT NULL,
  `ups_backup_duration` varchar(120) DEFAULT NULL,
  `generator_capacity` varchar(160) DEFAULT NULL,
  `primary_isp` varchar(160) DEFAULT NULL,
  `secondary_isp` varchar(160) DEFAULT NULL,
  `primary_bandwidth` varchar(120) DEFAULT NULL,
  `secondary_bandwidth` varchar(120) DEFAULT NULL,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`dc_id`),
  KEY `idx_data_center_capacity_racks` (`rack_used`,`rack_available`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `data_center_connectivity`
--

DROP TABLE IF EXISTS `data_center_connectivity`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `data_center_connectivity` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `source_dc_id` varchar(64) NOT NULL,
  `target_dc_id` varchar(64) DEFAULT NULL,
  `target_name` varchar(255) NOT NULL,
  `region_group` varchar(120) DEFAULT NULL,
  `line_variant` enum('general-network','replication','bidirectional-replication','secondary-network') NOT NULL DEFAULT 'general-network',
  `line_color` varchar(16) NOT NULL DEFAULT '#2563eb',
  `line_style` enum('direct','dotted') NOT NULL DEFAULT 'direct',
  `connection_type` enum('MPLS','Leased Line','VPN (IPSec)','SD-WAN') NOT NULL,
  `bandwidth` varchar(120) DEFAULT NULL,
  `latency_ms` int DEFAULT NULL,
  `is_redundant` tinyint(1) NOT NULL DEFAULT '1',
  `mode` enum('Active-Active','Active-Passive') NOT NULL DEFAULT 'Active-Passive',
  `replication_type` enum('Synchronous','Asynchronous') NOT NULL DEFAULT 'Asynchronous',
  `replication_tool` varchar(255) DEFAULT NULL,
  `failover` enum('Manual','Automatic') NOT NULL DEFAULT 'Manual',
  `rto` varchar(80) DEFAULT NULL,
  `rpo` varchar(80) DEFAULT NULL,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_data_center_connectivity` (`source_dc_id`,`target_name`,`line_variant`),
  KEY `idx_data_center_connectivity_source` (`source_dc_id`),
  KEY `idx_data_center_connectivity_target` (`target_dc_id`,`target_name`)
) ENGINE=InnoDB AUTO_INCREMENT=41 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `data_center_inventory`
--

DROP TABLE IF EXISTS `data_center_inventory`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `data_center_inventory` (
  `dc_id` varchar(64) NOT NULL,
  `physical_servers` int NOT NULL DEFAULT '0',
  `virtualization_hosts` int NOT NULL DEFAULT '0',
  `storage_arrays` int NOT NULL DEFAULT '0',
  `network_devices` int NOT NULL DEFAULT '0',
  `racks_occupied` int NOT NULL DEFAULT '0',
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`dc_id`),
  KEY `idx_data_center_inventory_footprint` (`racks_occupied`,`physical_servers`,`network_devices`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `data_centers`
--

DROP TABLE IF EXISTS `data_centers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `data_centers` (
  `id` varchar(64) NOT NULL,
  `dc_code` varchar(64) NOT NULL,
  `name` varchar(255) NOT NULL,
  `type` enum('colocation','shared','private') NOT NULL,
  `dc_role` enum('Primary','Disaster Recovery','Backup Site','Edge DC') NOT NULL,
  `region` varchar(120) NOT NULL,
  `region_group` varchar(120) DEFAULT NULL,
  `country` varchar(120) NOT NULL,
  `city` varchar(120) NOT NULL,
  `address` varchar(255) NOT NULL,
  `exact_address` varchar(255) DEFAULT NULL,
  `owner_company` varchar(255) NOT NULL,
  `business_unit` varchar(255) DEFAULT NULL,
  `vendor_provider` varchar(255) NOT NULL,
  `paired_dc_id` varchar(64) DEFAULT NULL,
  `paired_dc_name` varchar(255) DEFAULT NULL,
  `map_pos_x` decimal(5,2) DEFAULT NULL,
  `map_pos_y` decimal(5,2) DEFAULT NULL,
  `contact_person` varchar(160) NOT NULL,
  `contact_email` varchar(255) NOT NULL,
  `contact_phone` varchar(50) DEFAULT NULL,
  `noc_phone` varchar(50) NOT NULL,
  `noc_email` varchar(255) NOT NULL,
  `operational_work_hours` enum('9-5','8-6','24x7','24x5') DEFAULT '24x7',
  `visitor_access_required` enum('Yes','No') NOT NULL DEFAULT 'No',
  `visitor_name` varchar(160) DEFAULT NULL,
  `visitor_phone` varchar(50) DEFAULT NULL,
  `visitor_official_email` varchar(255) DEFAULT NULL,
  `visitor_vendor` varchar(255) DEFAULT NULL,
  `visit_duration` varchar(120) DEFAULT NULL,
  `visitor_special_instructions` text,
  `emergency_contact_name` varchar(160) DEFAULT NULL,
  `emergency_contact_phone` varchar(50) NOT NULL,
  `emergency_contact_email` varchar(255) DEFAULT NULL,
  `created_by` varchar(100) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_data_centers_dc_code` (`dc_code`),
  KEY `idx_data_centers_region` (`region_group`,`region`,`city`),
  KEY `idx_data_centers_role` (`dc_role`,`type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `database_monitor_logs`
--

DROP TABLE IF EXISTS `database_monitor_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `database_monitor_logs` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `target_key` varchar(200) NOT NULL,
  `target_name` varchar(120) NOT NULL,
  `target_type` varchar(50) NOT NULL,
  `engine` varchar(50) DEFAULT NULL,
  `version` varchar(255) DEFAULT NULL,
  `ok` tinyint(1) NOT NULL DEFAULT '0',
  `status` varchar(50) NOT NULL,
  `node_role` varchar(80) DEFAULT NULL,
  `node_state` varchar(80) DEFAULT NULL,
  `database_uptime_sec` bigint DEFAULT NULL,
  `total_databases` int DEFAULT NULL,
  `total_tables` int DEFAULT NULL,
  `total_space_mb` decimal(14,2) DEFAULT NULL,
  `used_space_mb` decimal(14,2) DEFAULT NULL,
  `free_space_mb` decimal(14,2) DEFAULT NULL,
  `used_pct` decimal(7,2) DEFAULT NULL,
  `latency_ms` decimal(10,2) DEFAULT NULL,
  `active_sessions` int DEFAULT NULL,
  `slow_queries` bigint DEFAULT NULL,
  `lock_count` bigint DEFAULT NULL,
  `replication_lag_sec` decimal(10,2) DEFAULT NULL,
  `os_platform` varchar(40) DEFAULT NULL,
  `os_distro` varchar(120) DEFAULT NULL,
  `os_version` varchar(80) DEFAULT NULL,
  `payload_json` json NOT NULL,
  `collected_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `connection_utilization_pct` decimal(7,2) DEFAULT NULL,
  `error_rate_pct` decimal(7,2) DEFAULT NULL,
  `cpu_load_pct` decimal(7,2) DEFAULT NULL,
  `memory_used_pct` decimal(7,2) DEFAULT NULL,
  `disk_used_pct` decimal(7,2) DEFAULT NULL,
  `host_pressure` varchar(20) DEFAULT NULL,
  `capability_matrix_json` json DEFAULT NULL,
  `db_signature` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_dbmon_target_time` (`target_key`,`collected_at`),
  KEY `idx_dbmon_collected` (`collected_at`)
) ENGINE=InnoDB AUTO_INCREMENT=1143 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `diagnostics_alert_events`
--

DROP TABLE IF EXISTS `diagnostics_alert_events`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `diagnostics_alert_events` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `rule_id` bigint NOT NULL,
  `asset_id` varchar(50) NOT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'Open',
  `current_streak` int NOT NULL,
  `severity_at_trigger` varchar(20) NOT NULL,
  `summary` varchar(512) NOT NULL,
  `triggered_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `resolved_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_diag_events_asset_status` (`asset_id`,`status`),
  KEY `idx_diag_events_rule_status` (`rule_id`,`status`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `diagnostics_alert_rules`
--

DROP TABLE IF EXISTS `diagnostics_alert_rules`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `diagnostics_alert_rules` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `asset_id` varchar(50) DEFAULT NULL,
  `enabled` tinyint(1) NOT NULL DEFAULT '1',
  `severity_threshold` varchar(20) NOT NULL DEFAULT 'high',
  `consecutive_runs` int NOT NULL DEFAULT '3',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_diag_rule_asset_enabled` (`asset_id`,`enabled`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `diagnostics_snapshots`
--

DROP TABLE IF EXISTS `diagnostics_snapshots`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `diagnostics_snapshots` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `asset_id` varchar(50) NOT NULL,
  `trigger_source` varchar(20) NOT NULL DEFAULT 'auto',
  `monitor_status` varchar(20) DEFAULT NULL,
  `severity` varchar(20) NOT NULL,
  `probable_cause` varchar(512) NOT NULL,
  `payload_json` json NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `root_cause_category` varchar(20) NOT NULL DEFAULT 'App',
  PRIMARY KEY (`id`),
  KEY `idx_diag_asset_time` (`asset_id`,`created_at`),
  KEY `idx_diag_asset_severity` (`asset_id`,`severity`)
) ENGINE=InnoDB AUTO_INCREMENT=231 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `health_checks`
--

DROP TABLE IF EXISTS `health_checks`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `health_checks` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `agent_id` varchar(50) NOT NULL,
  `hostname` varchar(255) NOT NULL,
  `os_name` varchar(100) DEFAULT NULL,
  `os_version` varchar(100) DEFAULT NULL,
  `server_healthy` tinyint(1) NOT NULL,
  `cpu_usage_pct` decimal(10,2) DEFAULT NULL,
  `memory_usage_pct` decimal(10,2) DEFAULT NULL,
  `cpu_temperature_c` decimal(10,2) DEFAULT NULL,
  `network_latency_ms` decimal(10,2) DEFAULT NULL,
  `network_download_mbps` decimal(10,2) DEFAULT NULL,
  `network_rx_mbps` decimal(10,2) DEFAULT NULL,
  `network_tx_mbps` decimal(10,2) DEFAULT NULL,
  `failed_services_count` int NOT NULL DEFAULT '0',
  `hung_process_count` int NOT NULL DEFAULT '0',
  `payload_json` json NOT NULL,
  `checked_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_health_checks_agent_time` (`agent_id`,`checked_at`),
  KEY `idx_health_checks_healthy` (`server_healthy`,`checked_at`)
) ENGINE=InnoDB AUTO_INCREMENT=3161 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `investigate_ticket_updates`
--

DROP TABLE IF EXISTS `investigate_ticket_updates`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `investigate_ticket_updates` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `ticket_id` varchar(64) NOT NULL,
  `note_text` longtext,
  `ticket_state` enum('In progress','ServiceNow','Canceled','Resolved','Closed Un-resolved') DEFAULT NULL,
  `actor_username` varchar(100) DEFAULT NULL,
  `actor_role` varchar(30) DEFAULT NULL,
  `note_source` enum('manual-note','status-change','system') NOT NULL DEFAULT 'manual-note',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_investigate_ticket_updates_ticket` (`ticket_id`,`created_at`)
) ENGINE=InnoDB AUTO_INCREMENT=789 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `investigate_tickets`
--

DROP TABLE IF EXISTS `investigate_tickets`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `investigate_tickets` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `ticket_id` varchar(64) NOT NULL,
  `agent_id` varchar(50) NOT NULL,
  `hostname` varchar(255) NOT NULL,
  `metric_type` varchar(50) NOT NULL,
  `resource_key` varchar(255) NOT NULL DEFAULT 'overall',
  `severity` enum('P1','P2','P3') NOT NULL,
  `current_value` decimal(10,2) NOT NULL,
  `threshold_value` decimal(10,2) NOT NULL,
  `status` enum('Open','Resolved') NOT NULL DEFAULT 'Open',
  `description` varchar(512) NOT NULL,
  `work_notes` longtext,
  `ticket_state` enum('In progress','ServiceNow','Canceled','Resolved','Closed Un-resolved') DEFAULT 'In progress',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `last_seen_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `resolved_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `ticket_id` (`ticket_id`),
  KEY `idx_investigate_agent_status` (`agent_id`,`status`),
  KEY `idx_investigate_status_created` (`status`,`created_at`)
) ENGINE=InnoDB AUTO_INCREMENT=898 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `maintenance_mode`
--

DROP TABLE IF EXISTS `maintenance_mode`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `maintenance_mode` (
  `id` varchar(64) NOT NULL,
  `entity_id` varchar(64) NOT NULL,
  `entity_name` varchar(255) NOT NULL,
  `entity_type` varchar(100) NOT NULL,
  `start_time` timestamp NOT NULL,
  `end_time` timestamp NOT NULL,
  `status` enum('scheduled','active','expired','cancelled') NOT NULL DEFAULT 'scheduled',
  `suppress_alerts` tinyint(1) NOT NULL DEFAULT '1',
  `suppress_incidents` tinyint(1) NOT NULL DEFAULT '1',
  `notes` text,
  `created_by` varchar(100) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_maintenance_entity` (`entity_id`,`status`,`start_time`,`end_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `maintenance_windows`
--

DROP TABLE IF EXISTS `maintenance_windows`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `maintenance_windows` (
  `id` varchar(64) NOT NULL,
  `title` varchar(255) NOT NULL,
  `reason` text,
  `start_time` timestamp NOT NULL,
  `end_time` timestamp NOT NULL,
  `scope_type` varchar(64) NOT NULL,
  `scope_target` varchar(255) DEFAULT NULL,
  `suppress_alerts` tinyint(1) DEFAULT '1',
  `is_completed` tinyint(1) DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_mw_dates` (`start_time`,`end_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `monitor_logs`
--

DROP TABLE IF EXISTS `monitor_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `monitor_logs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `asset_id` varchar(50) DEFAULT NULL,
  `status` varchar(50) DEFAULT NULL,
  `response_time_ms` int DEFAULT NULL,
  `message` varchar(255) DEFAULT NULL,
  `status_code` int DEFAULT NULL,
  `timestamp` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `asset_id` (`asset_id`),
  CONSTRAINT `monitor_logs_ibfk_1` FOREIGN KEY (`asset_id`) REFERENCES `assets` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=71901 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `portal_audit_logs`
--

DROP TABLE IF EXISTS `portal_audit_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `portal_audit_logs` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `event_type` enum('auth','action','security','system') NOT NULL,
  `action` varchar(120) NOT NULL,
  `actor_username` varchar(100) DEFAULT NULL,
  `actor_role` varchar(30) DEFAULT NULL,
  `target_type` varchar(80) DEFAULT NULL,
  `target_id` varchar(160) DEFAULT NULL,
  `severity` enum('info','warning','critical') NOT NULL DEFAULT 'info',
  `outcome` enum('success','failed') NOT NULL DEFAULT 'success',
  `resolved_at` timestamp NULL DEFAULT NULL,
  `resolved_by` varchar(100) DEFAULT NULL,
  `message` varchar(1024) DEFAULT NULL,
  `details_json` json DEFAULT NULL,
  `ip_address` varchar(120) DEFAULT NULL,
  `user_agent` varchar(512) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_portal_audit_created` (`created_at`),
  KEY `idx_portal_audit_actor` (`actor_username`,`created_at`),
  KEY `idx_portal_audit_event` (`event_type`,`action`,`created_at`),
  KEY `idx_portal_audit_severity` (`severity`,`outcome`,`created_at`),
  KEY `idx_portal_audit_resolved` (`resolved_at`,`resolved_by`)
) ENGINE=InnoDB AUTO_INCREMENT=473 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `portal_runtime_snapshots`
--

DROP TABLE IF EXISTS `portal_runtime_snapshots`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `portal_runtime_snapshots` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `frontend_url` varchar(512) NOT NULL,
  `backend_url` varchar(512) NOT NULL,
  `frontend_ok` tinyint(1) NOT NULL DEFAULT '0',
  `frontend_status_code` int NOT NULL DEFAULT '0',
  `frontend_latency_ms` int NOT NULL DEFAULT '0',
  `backend_ok` tinyint(1) NOT NULL DEFAULT '0',
  `backend_status_code` int NOT NULL DEFAULT '0',
  `backend_latency_ms` int NOT NULL DEFAULT '0',
  `portal_uptime_seconds` bigint DEFAULT NULL,
  `app_version` varchar(40) DEFAULT NULL,
  `db_engine_name` varchar(40) DEFAULT NULL,
  `db_engine_version` varchar(120) DEFAULT NULL,
  `db_space_bytes` bigint DEFAULT NULL,
  `db_signature` varchar(128) DEFAULT NULL,
  `db_uptime_seconds` bigint DEFAULT NULL,
  `vulnerability_total` int NOT NULL DEFAULT '0',
  `vulnerability_info` int NOT NULL DEFAULT '0',
  `vulnerability_low` int NOT NULL DEFAULT '0',
  `vulnerability_moderate` int NOT NULL DEFAULT '0',
  `vulnerability_high` int NOT NULL DEFAULT '0',
  `vulnerability_critical` int NOT NULL DEFAULT '0',
  `overall_status` enum('healthy','degraded','critical') NOT NULL DEFAULT 'healthy',
  `highest_severity` enum('info','warning','critical') NOT NULL DEFAULT 'info',
  `details_json` json DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_portal_runtime_created` (`created_at`),
  KEY `idx_portal_runtime_status` (`overall_status`,`highest_severity`,`created_at`)
) ENGINE=InnoDB AUTO_INCREMENT=65 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `rackpoint_devices`
--

DROP TABLE IF EXISTS `rackpoint_devices`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `rackpoint_devices` (
  `id` varchar(64) NOT NULL,
  `rack_id` varchar(64) NOT NULL,
  `name` varchar(160) NOT NULL,
  `serial_number` varchar(160) DEFAULT NULL,
  `hostname` varchar(255) DEFAULT NULL,
  `type` enum('server','storage','network','firewall','loadbalancer','patch','kvm','ups','pdu') NOT NULL,
  `u_start` int NOT NULL,
  `u_size` int NOT NULL,
  `vendor` varchar(120) NOT NULL,
  `model` varchar(160) NOT NULL,
  `ip` varchar(120) DEFAULT NULL,
  `status` enum('active','standby','maintenance','offline') NOT NULL DEFAULT 'active',
  `availability_status` enum('reachable','unreachable','unknown') NOT NULL DEFAULT 'unknown',
  `availability_message` varchar(255) DEFAULT NULL,
  `last_availability_latency_ms` int DEFAULT NULL,
  `last_availability_checked_at` timestamp NULL DEFAULT NULL,
  `role` varchar(255) DEFAULT NULL,
  `specs` text,
  `created_by` varchar(100) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_rackpoint_devices_rack_slot` (`rack_id`,`u_start`),
  KEY `idx_rackpoint_devices_type` (`type`,`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `rackpoint_racks`
--

DROP TABLE IF EXISTS `rackpoint_racks`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `rackpoint_racks` (
  `id` varchar(64) NOT NULL,
  `name` varchar(120) NOT NULL,
  `dc_id` varchar(64) NOT NULL,
  `dc_name` varchar(255) NOT NULL,
  `rack_type` enum('42U','45U','48U') NOT NULL,
  `total_u` int NOT NULL,
  `location` varchar(255) NOT NULL,
  `power_draw` varchar(60) DEFAULT NULL,
  `created_by` varchar(100) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_rackpoint_rack_name` (`dc_id`,`name`),
  KEY `idx_rackpoint_dc` (`dc_id`,`dc_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `servicenow_incidents`
--

DROP TABLE IF EXISTS `servicenow_incidents`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `servicenow_incidents` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `investigate_ticket_id` varchar(64) NOT NULL,
  `incident_number` varchar(64) DEFAULT NULL,
  `sys_id` varchar(64) DEFAULT NULL,
  `state` varchar(64) DEFAULT NULL,
  `status` enum('Created','Failed') NOT NULL DEFAULT 'Created',
  `last_error` varchar(512) DEFAULT NULL,
  `payload_json` json DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `investigate_ticket_id` (`investigate_ticket_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `snmp_devices`
--

DROP TABLE IF EXISTS `snmp_devices`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `snmp_devices` (
  `id` varchar(64) NOT NULL,
  `asset_id` varchar(50) DEFAULT NULL,
  `name` varchar(255) NOT NULL,
  `vendor` varchar(100) DEFAULT NULL,
  `device_type` varchar(60) NOT NULL,
  `host` varchar(255) NOT NULL,
  `port` int NOT NULL DEFAULT '161',
  `snmp_version` enum('2c','3') NOT NULL DEFAULT '2c',
  `community` varchar(255) DEFAULT NULL,
  `sec_username` varchar(255) DEFAULT NULL,
  `auth_protocol` enum('MD5','SHA','SHA224','SHA256','SHA384','SHA512') DEFAULT NULL,
  `auth_key` varchar(255) DEFAULT NULL,
  `priv_protocol` enum('DES','AES','AES192','AES256') DEFAULT NULL,
  `priv_key` varchar(255) DEFAULT NULL,
  `context_name` varchar(255) DEFAULT NULL,
  `enabled` tinyint(1) NOT NULL DEFAULT '1',
  `poll_interval_sec` int NOT NULL DEFAULT '60',
  `retention_hours` int NOT NULL DEFAULT '48',
  `status` varchar(50) NOT NULL DEFAULT 'Unknown',
  `last_polled_at` timestamp NULL DEFAULT NULL,
  `last_error` varchar(512) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_snmp_target` (`host`,`port`),
  KEY `idx_snmp_enabled` (`enabled`),
  KEY `idx_snmp_asset` (`asset_id`),
  KEY `idx_snmp_vendor` (`vendor`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `snmp_telemetry_samples`
--

DROP TABLE IF EXISTS `snmp_telemetry_samples`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `snmp_telemetry_samples` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `device_id` varchar(64) NOT NULL,
  `metric_key` varchar(120) NOT NULL,
  `metric_value_num` decimal(20,4) DEFAULT NULL,
  `metric_value_text` varchar(512) DEFAULT NULL,
  `unit` varchar(30) DEFAULT NULL,
  `oid` varchar(128) NOT NULL,
  `severity` varchar(20) NOT NULL DEFAULT 'info',
  `sample_time` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_snmp_samples_device_time` (`device_id`,`sample_time`),
  KEY `idx_snmp_samples_metric_time` (`metric_key`,`sample_time`)
) ENGINE=InnoDB AUTO_INCREMENT=121 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `snmp_traps`
--

DROP TABLE IF EXISTS `snmp_traps`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `snmp_traps` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `device_id` varchar(64) DEFAULT NULL,
  `source_ip` varchar(120) NOT NULL,
  `trap_oid` varchar(128) NOT NULL,
  `severity` varchar(20) NOT NULL DEFAULT 'warning',
  `message` varchar(512) DEFAULT NULL,
  `payload_json` json DEFAULT NULL,
  `received_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_snmp_traps_device_time` (`device_id`,`received_at`),
  KEY `idx_snmp_traps_source_time` (`source_ip`,`received_at`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `status_notifications`
--

DROP TABLE IF EXISTS `status_notifications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `status_notifications` (
  `id` varchar(64) NOT NULL,
  `title` varchar(255) NOT NULL,
  `message` text NOT NULL,
  `severity` enum('info','warning','critical') NOT NULL DEFAULT 'info',
  `is_global` tinyint(1) NOT NULL DEFAULT '0',
  `status_page_id` varchar(64) DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `publish_at` timestamp NULL DEFAULT NULL,
  `remove_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_status_notifications_active` (`is_active`),
  KEY `idx_status_notifications_page` (`status_page_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `status_pages`
--

DROP TABLE IF EXISTS `status_pages`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `status_pages` (
  `id` varchar(64) NOT NULL,
  `name` varchar(160) NOT NULL,
  `group_name` varchar(160) DEFAULT NULL,
  `components_json` json NOT NULL,
  `timezone` varchar(80) NOT NULL DEFAULT 'UTC',
  `company_name` varchar(255) NOT NULL,
  `page_address` varchar(255) NOT NULL,
  `show_response_charts` tinyint(1) NOT NULL DEFAULT '1',
  `public_token` varchar(96) NOT NULL,
  `created_by` varchar(100) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_status_pages_token` (`public_token`),
  UNIQUE KEY `uniq_status_pages_address` (`page_address`),
  KEY `idx_status_pages_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `syslog_events`
--

DROP TABLE IF EXISTS `syslog_events`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `syslog_events` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `device_id` varchar(64) DEFAULT NULL,
  `source_ip` varchar(120) NOT NULL,
  `hostname` varchar(255) DEFAULT NULL,
  `app_name` varchar(120) DEFAULT NULL,
  `facility` int DEFAULT NULL,
  `severity` int DEFAULT NULL,
  `severity_label` varchar(20) DEFAULT NULL,
  `message` varchar(1024) NOT NULL,
  `raw_message` text,
  `payload_json` json DEFAULT NULL,
  `received_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_syslog_device_time` (`device_id`,`received_at`),
  KEY `idx_syslog_source_time` (`source_ip`,`received_at`),
  KEY `idx_syslog_severity_time` (`severity_label`,`received_at`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `user_feedback`
--

DROP TABLE IF EXISTS `user_feedback`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_feedback` (
  `id` int NOT NULL AUTO_INCREMENT,
  `username` varchar(100) NOT NULL,
  `email` varchar(255) DEFAULT NULL,
  `category` varchar(80) NOT NULL DEFAULT 'general',
  `rating` int DEFAULT NULL,
  `message` text NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_user_feedback_user` (`username`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `username` varchar(100) NOT NULL,
  `email` varchar(255) DEFAULT NULL,
  `password_hash` varchar(64) NOT NULL,
  `role` enum('admin','editor','superuser','viewer') NOT NULL DEFAULT 'editor',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `full_name` varchar(255) DEFAULT NULL,
  `employee_id` varchar(80) DEFAULT NULL,
  `contact_number` varchar(50) DEFAULT NULL,
  `team` varchar(120) DEFAULT NULL,
  `company` varchar(255) DEFAULT NULL,
  `manager_name` varchar(255) DEFAULT NULL,
  `manager_email` varchar(255) DEFAULT NULL,
  `account_status` enum('pending','approved','rejected','suspended') NOT NULL DEFAULT 'pending',
  `rejection_reason` varchar(512) DEFAULT NULL,
  `reviewed_by` varchar(100) DEFAULT NULL,
  `reviewed_at` timestamp NULL DEFAULT NULL,
  `password_updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `username` (`username`),
  UNIQUE KEY `uniq_users_email` (`email`),
  UNIQUE KEY `uniq_users_employee_id` (`employee_id`)
) ENGINE=InnoDB AUTO_INCREMENT=189 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-04-26 13:47:37
