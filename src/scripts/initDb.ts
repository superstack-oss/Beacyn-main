import mysql from 'mysql2/promise';

import 'dotenv/config';

const host = process.env.DB_HOST || 'localhost';
const user = process.env.DB_USER || 'root';
const password = process.env.DB_PASSWORD || '';
const databaseName = process.env.DB_NAME || 'pulseiq';
const port = Number(process.env.DB_PORT || 3306);
const isLocalHost = host === 'localhost' || host === '127.0.0.1';
const useSsl = (process.env.DB_SSL || '').toLowerCase() === 'true' || !isLocalHost;
const rejectUnauthorized = (process.env.DB_SSL_REJECT_UNAUTHORIZED || '').toLowerCase() === 'true';

async function ensureIndex(
  connection: mysql.Connection,
  databaseName: string,
  tableName: string,
  indexName: string,
  createSql: string
) {
  const [rows]: any = await connection.query(
    `
      SELECT COUNT(*) AS cnt
      FROM information_schema.statistics
      WHERE table_schema = ? AND table_name = ? AND index_name = ?
    `,
    [databaseName, tableName, indexName]
  );

  if (!rows[0]?.cnt) {
    await connection.query(createSql);
  }
}

async function initDb() {
  console.log("Connecting to MySQL server...");
  try {
    const connection = await mysql.createConnection({
      host,
      user,
      password,
      port,
      ...(useSsl ? { ssl: { rejectUnauthorized } } : {}),
    });

    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${databaseName}\`;`);
    await connection.query(`USE \`${databaseName}\`;`);
    
    // Create assets table with all real tracking columns
    await connection.query(`
      CREATE TABLE IF NOT EXISTS assets (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        parent_type VARCHAR(100),
        sub_type VARCHAR(100),
        target_endpoint VARCHAR(512),
        environment VARCHAR(50),
        status VARCHAR(50) DEFAULT 'Initializing',
        last_checked_at TIMESTAMP NULL,
        last_response_ms INT NULL,
        ssl_expiry_at TIMESTAMP NULL,
        first_up_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Add new columns to existing installs (safe to run multiple times)
    const alterColumns = [
      `ALTER TABLE assets ADD COLUMN IF NOT EXISTS last_checked_at TIMESTAMP NULL`,
      `ALTER TABLE assets ADD COLUMN IF NOT EXISTS last_response_ms INT NULL`,
      `ALTER TABLE assets ADD COLUMN IF NOT EXISTS ssl_expiry_at TIMESTAMP NULL`,
      `ALTER TABLE assets ADD COLUMN IF NOT EXISTS first_up_at TIMESTAMP NULL`,
    ];
    for (const sql of alterColumns) {
      try { await connection.query(sql); } catch (_) { /* column already exists */ }
    }
    console.log("Table 'assets' ready.");

    await connection.query(`
      CREATE TABLE IF NOT EXISTS monitor_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        asset_id VARCHAR(50),
        status VARCHAR(50),
        response_time_ms INT,
        message VARCHAR(512),
        status_code INT,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE
      );
    `);
    console.log("Table 'monitor_logs' ready.");

    await connection.query(`
      CREATE TABLE IF NOT EXISTS agents (
        id VARCHAR(50) PRIMARY KEY,
        hostname VARCHAR(255) NOT NULL,
        os VARCHAR(100) NOT NULL,
        os_version VARCHAR(100) NOT NULL,
        agent_version VARCHAR(50) NOT NULL,
        status ENUM('Actively Syncing', 'Delayed Sync', 'Offline') DEFAULT 'Delayed Sync',
        started_at TIMESTAMP NULL,
        last_heartbeat_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await ensureIndex(
      connection,
      databaseName,
      'agents',
      'idx_agents_heartbeat',
      'CREATE INDEX idx_agents_heartbeat ON agents(last_heartbeat_at)'
    );
    await ensureIndex(
      connection,
      databaseName,
      'agents',
      'idx_agents_status',
      'CREATE INDEX idx_agents_status ON agents(status)'
    );
    console.log("Table 'agents' ready.");

    await connection.query(`
      CREATE TABLE IF NOT EXISTS agent_metrics (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        agent_id VARCHAR(50) NOT NULL,
        hostname VARCHAR(255) NOT NULL,
        platform VARCHAR(50) NOT NULL,
        distro VARCHAR(120) NULL,
        os_version VARCHAR(120) NULL,
        payload_json JSON NOT NULL,
        collected_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_agent_metrics_agent_time (agent_id, collected_at),
        INDEX idx_agent_metrics_collected (collected_at)
      );
    `);
    console.log("Table 'agent_metrics' ready.");

    await connection.query(`
      CREATE TABLE IF NOT EXISTS investigate_tickets (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        ticket_id VARCHAR(64) NOT NULL UNIQUE,
        agent_id VARCHAR(50) NOT NULL,
        hostname VARCHAR(255) NOT NULL,
        metric_type VARCHAR(50) NOT NULL,
        resource_key VARCHAR(255) NOT NULL DEFAULT 'overall',
        severity ENUM('P1', 'P2', 'P3') NOT NULL,
        current_value DECIMAL(10,2) NOT NULL,
        threshold_value DECIMAL(10,2) NOT NULL,
        status ENUM('Open', 'Resolved') NOT NULL DEFAULT 'Open',
        description VARCHAR(512) NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        last_seen_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        resolved_at TIMESTAMP NULL
      );
    `);
    await ensureIndex(
      connection,
      databaseName,
      'investigate_tickets',
      'idx_investigate_agent_status',
      'CREATE INDEX idx_investigate_agent_status ON investigate_tickets(agent_id, status)'
    );
    await ensureIndex(
      connection,
      databaseName,
      'investigate_tickets',
      'idx_investigate_status_created',
      'CREATE INDEX idx_investigate_status_created ON investigate_tickets(status, created_at)'
    );
    console.log("Table 'investigate_tickets' ready.");

    await connection.query(`
      CREATE TABLE IF NOT EXISTS health_checks (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        agent_id VARCHAR(50) NOT NULL,
        hostname VARCHAR(255) NOT NULL,
        os_name VARCHAR(100) NULL,
        os_version VARCHAR(100) NULL,
        server_healthy TINYINT(1) NOT NULL,
        cpu_usage_pct DECIMAL(10,2) NULL,
        memory_usage_pct DECIMAL(10,2) NULL,
        cpu_temperature_c DECIMAL(10,2) NULL,
        network_latency_ms DECIMAL(10,2) NULL,
        network_download_mbps DECIMAL(10,2) NULL,
        network_rx_mbps DECIMAL(10,2) NULL,
        network_tx_mbps DECIMAL(10,2) NULL,
        failed_services_count INT NOT NULL DEFAULT 0,
        hung_process_count INT NOT NULL DEFAULT 0,
        payload_json JSON NOT NULL,
        checked_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await ensureIndex(
      connection,
      databaseName,
      'health_checks',
      'idx_health_checks_agent_time',
      'CREATE INDEX idx_health_checks_agent_time ON health_checks(agent_id, checked_at)'
    );
    await ensureIndex(
      connection,
      databaseName,
      'health_checks',
      'idx_health_checks_healthy',
      'CREATE INDEX idx_health_checks_healthy ON health_checks(server_healthy, checked_at)'
    );
    console.log("Table 'health_checks' ready.");

    await connection.query(`
      CREATE TABLE IF NOT EXISTS database_monitor_logs (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        target_key VARCHAR(200) NOT NULL,
        target_name VARCHAR(120) NOT NULL,
        target_type VARCHAR(50) NOT NULL,
        engine VARCHAR(50) NULL,
        version VARCHAR(255) NULL,
        ok TINYINT(1) NOT NULL DEFAULT 0,
        status VARCHAR(50) NOT NULL,
        node_role VARCHAR(80) NULL,
        node_state VARCHAR(80) NULL,
        database_uptime_sec BIGINT NULL,
        total_databases INT NULL,
        total_tables INT NULL,
        total_space_mb DECIMAL(14,2) NULL,
        used_space_mb DECIMAL(14,2) NULL,
        free_space_mb DECIMAL(14,2) NULL,
        used_pct DECIMAL(7,2) NULL,
        latency_ms DECIMAL(10,2) NULL,
        active_sessions INT NULL,
        slow_queries BIGINT NULL,
        lock_count BIGINT NULL,
        replication_lag_sec DECIMAL(10,2) NULL,
        os_platform VARCHAR(40) NULL,
        os_distro VARCHAR(120) NULL,
        os_version VARCHAR(80) NULL,
        payload_json JSON NOT NULL,
        collected_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await ensureIndex(
      connection,
      'pulseiq',
      'database_monitor_logs',
      'idx_dbmon_target_time',
      'CREATE INDEX idx_dbmon_target_time ON database_monitor_logs(target_key, collected_at)'
    );
    await ensureIndex(
      connection,
      'pulseiq',
      'database_monitor_logs',
      'idx_dbmon_collected',
      'CREATE INDEX idx_dbmon_collected ON database_monitor_logs(collected_at)'
    );
    console.log("Table 'database_monitor_logs' ready.");

    // Seed only if completely empty
    const [rows]: any = await connection.query(`SELECT COUNT(*) as count FROM assets`);
    if (rows[0].count === 0) {
      await connection.query(`
        INSERT INTO assets (id, name, parent_type, sub_type, target_endpoint, environment, status)
        VALUES 
          ('INV-001', 'Google', 'Website', NULL, 'https://google.com', 'Production', 'Initializing'),
          ('INV-002', 'Cloudflare DNS', 'Network Port', 'Ping', '1.1.1.1', 'Production', 'Initializing'),
          ('INV-003', 'Nvidia', 'Website', NULL, 'https://nvidia.com', 'Production', 'Initializing')
      `);
      console.log("Seeded initial assets.");
    } else {
      console.log("Assets already exist — skipping seed.");
    }

    await connection.end();
    console.log("Database ready.");
  } catch (err) {
    console.error("DB init error:", err);
    process.exit(1);
  }
}

initDb();
