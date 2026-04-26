-- MySQL dump 10.13  Distrib 8.0.45, for macos15 (arm64)
--
-- Host: localhost    Database: bsa
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
-- Table structure for table `agents`
--

DROP TABLE IF EXISTS `agents`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `agents` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `agent_uuid` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `customer_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `agent_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `hostname` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `os_name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `platform` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `platform_version` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `kernel_version` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `architecture` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `virtualization_type` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `serial_hint` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `serial_number` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `machine_type` enum('vm','baremetal','unknown') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'unknown',
  `heartbeat` enum('Active','Inactive') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Inactive',
  `first_seen_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_seen_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_agents_agent_uuid` (`agent_uuid`),
  KEY `idx_agents_customer_id` (`customer_id`),
  KEY `idx_agents_last_seen_at` (`last_seen_at`)
) ENGINE=InnoDB AUTO_INCREMENT=7660 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `disk_metrics`
--

DROP TABLE IF EXISTS `disk_metrics`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `disk_metrics` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `snapshot_id` bigint unsigned NOT NULL,
  `agent_id` bigint unsigned NOT NULL,
  `device_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `mountpoint` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `fs_type` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `total_bytes` bigint unsigned DEFAULT NULL,
  `used_bytes` bigint unsigned DEFAULT NULL,
  `free_bytes` bigint unsigned DEFAULT NULL,
  `used_percent` decimal(6,2) DEFAULT NULL,
  `inode_used_percent` decimal(6,2) DEFAULT NULL,
  `read_bytes` bigint unsigned DEFAULT NULL,
  `write_bytes` bigint unsigned DEFAULT NULL,
  `health_status` enum('ok','warning','critical','unknown') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'unknown',
  `smart_summary` text COLLATE utf8mb4_unicode_ci,
  `captured_at` datetime NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_disk_metrics_agent_time` (`agent_id`,`captured_at`),
  KEY `idx_disk_metrics_mountpoint` (`mountpoint`),
  KEY `fk_disk_metrics_snapshot` (`snapshot_id`),
  CONSTRAINT `fk_disk_metrics_agent` FOREIGN KEY (`agent_id`) REFERENCES `agents` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_disk_metrics_snapshot` FOREIGN KEY (`snapshot_id`) REFERENCES `metric_snapshots` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=79639 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `docker_container_stats`
--

DROP TABLE IF EXISTS `docker_container_stats`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `docker_container_stats` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `snapshot_id` bigint unsigned NOT NULL,
  `agent_id` bigint unsigned NOT NULL,
  `container_identifier` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL,
  `container_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `image_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `state_name` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status_text` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cpu_percent` decimal(6,2) DEFAULT NULL,
  `memory_usage_bytes` bigint unsigned DEFAULT NULL,
  `memory_limit_bytes` bigint unsigned DEFAULT NULL,
  `memory_percent` decimal(6,2) DEFAULT NULL,
  `net_rx_bytes` bigint unsigned DEFAULT NULL,
  `net_tx_bytes` bigint unsigned DEFAULT NULL,
  `block_read_bytes` bigint unsigned DEFAULT NULL,
  `block_write_bytes` bigint unsigned DEFAULT NULL,
  `pids` bigint unsigned DEFAULT NULL,
  `captured_at` datetime NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_docker_stats_agent_time` (`agent_id`,`captured_at`),
  KEY `idx_docker_stats_container` (`container_identifier`),
  KEY `fk_docker_stats_snapshot` (`snapshot_id`),
  CONSTRAINT `fk_docker_stats_agent` FOREIGN KEY (`agent_id`) REFERENCES `agents` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_docker_stats_snapshot` FOREIGN KEY (`snapshot_id`) REFERENCES `metric_snapshots` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=1820 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `health_events`
--

DROP TABLE IF EXISTS `health_events`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `health_events` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `snapshot_id` bigint unsigned NOT NULL,
  `agent_id` bigint unsigned NOT NULL,
  `check_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `severity` enum('ok','warning','critical','unknown') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'unknown',
  `message` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `resolved_at` datetime DEFAULT NULL,
  `captured_at` datetime NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_health_events_agent_time` (`agent_id`,`captured_at`),
  KEY `idx_health_events_severity_time` (`severity`,`captured_at`),
  KEY `fk_health_events_snapshot` (`snapshot_id`),
  CONSTRAINT `fk_health_events_agent` FOREIGN KEY (`agent_id`) REFERENCES `agents` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_health_events_snapshot` FOREIGN KEY (`snapshot_id`) REFERENCES `metric_snapshots` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=52023 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `metric_snapshots`
--

DROP TABLE IF EXISTS `metric_snapshots`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `metric_snapshots` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `agent_id` bigint unsigned NOT NULL,
  `captured_at` datetime NOT NULL,
  `health_status` enum('ok','warning','critical','unknown') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'unknown',
  `cpu_usage_percent` decimal(6,2) DEFAULT NULL,
  `cpu_load_1` decimal(8,2) DEFAULT NULL,
  `cpu_load_5` decimal(8,2) DEFAULT NULL,
  `cpu_load_15` decimal(8,2) DEFAULT NULL,
  `cpu_frequency_mhz` decimal(10,2) DEFAULT NULL,
  `cpu_temperature_c` decimal(6,2) DEFAULT NULL,
  `memory_total_bytes` bigint unsigned DEFAULT NULL,
  `memory_used_bytes` bigint unsigned DEFAULT NULL,
  `memory_available_bytes` bigint unsigned DEFAULT NULL,
  `memory_used_percent` decimal(6,2) DEFAULT NULL,
  `swap_total_bytes` bigint unsigned DEFAULT NULL,
  `swap_used_bytes` bigint unsigned DEFAULT NULL,
  `swap_used_percent` decimal(6,2) DEFAULT NULL,
  `network_bytes_sent` bigint unsigned DEFAULT NULL,
  `network_bytes_recv` bigint unsigned DEFAULT NULL,
  `network_packets_sent` bigint unsigned DEFAULT NULL,
  `network_packets_recv` bigint unsigned DEFAULT NULL,
  `disk_read_bytes` bigint unsigned DEFAULT NULL,
  `disk_write_bytes` bigint unsigned DEFAULT NULL,
  `bandwidth_in_bps` decimal(12,2) DEFAULT NULL,
  `bandwidth_out_bps` decimal(12,2) DEFAULT NULL,
  `disk_read_iops` decimal(12,2) DEFAULT NULL,
  `disk_write_iops` decimal(12,2) DEFAULT NULL,
  `port_throughput_in_bps` decimal(12,2) DEFAULT NULL,
  `port_throughput_out_bps` decimal(12,2) DEFAULT NULL,
  `network_latency_ms` decimal(10,2) DEFAULT NULL,
  `network_latency_avg_ms` decimal(10,2) DEFAULT NULL,
  `network_latency_min_ms` decimal(10,2) DEFAULT NULL,
  `network_latency_max_ms` decimal(10,2) DEFAULT NULL,
  `network_latency_trend_json` json DEFAULT NULL,
  `process_total` int DEFAULT NULL,
  `process_hung` int DEFAULT NULL,
  `process_zombie` int DEFAULT NULL,
  `diagnostics_json` json DEFAULT NULL,
  `payload_json` json NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_metric_snapshots_agent_time` (`agent_id`,`captured_at`),
  KEY `idx_metric_snapshots_health_time` (`health_status`,`captured_at`),
  CONSTRAINT `fk_metric_snapshots_agent` FOREIGN KEY (`agent_id`) REFERENCES `agents` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=7646 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `network_interfaces`
--

DROP TABLE IF EXISTS `network_interfaces`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `network_interfaces` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `snapshot_id` bigint unsigned NOT NULL,
  `agent_id` bigint unsigned NOT NULL,
  `interface_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `mac_address` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `mtu` int DEFAULT NULL,
  `flags_json` json DEFAULT NULL,
  `addresses_json` json DEFAULT NULL,
  `bytes_sent` bigint unsigned DEFAULT NULL,
  `bytes_recv` bigint unsigned DEFAULT NULL,
  `packets_sent` bigint unsigned DEFAULT NULL,
  `packets_recv` bigint unsigned DEFAULT NULL,
  `errors_in` bigint unsigned DEFAULT NULL,
  `errors_out` bigint unsigned DEFAULT NULL,
  `drop_in` bigint unsigned DEFAULT NULL,
  `drop_out` bigint unsigned DEFAULT NULL,
  `captured_at` datetime NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_network_interfaces_agent_time` (`agent_id`,`captured_at`),
  KEY `idx_network_interfaces_name` (`interface_name`),
  KEY `fk_network_interfaces_snapshot` (`snapshot_id`),
  CONSTRAINT `fk_network_interfaces_agent` FOREIGN KEY (`agent_id`) REFERENCES `agents` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_network_interfaces_snapshot` FOREIGN KEY (`snapshot_id`) REFERENCES `metric_snapshots` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=137594 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
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
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-04-26 13:46:23
