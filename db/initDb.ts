import mysql from 'mysql2/promise';

import 'dotenv/config';

const host = process.env.DB_HOST || 'localhost';
const user = process.env.DB_USER || 'root';
const password = process.env.DB_PASSWORD || 'madhumitaN8#';
const databaseName = process.env.DB_NAME || 'pulseiq';
const port = Number(process.env.DB_PORT || 3306);
const useSsl = (process.env.DB_SSL || '').toLowerCase() === 'true';
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

async function ensureColumn(
  connection: mysql.Connection,
  databaseName: string,
  tableName: string,
  columnName: string,
  alterSql: string
) {
  const [rows]: any = await connection.query(
    `
      SELECT COUNT(*) AS cnt
      FROM information_schema.columns
      WHERE table_schema = ? AND table_name = ? AND column_name = ?
    `,
    [databaseName, tableName, columnName]
  );

  if (!rows[0]?.cnt) {
    await connection.query(alterSql);
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

    // Create maintenance_mode table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS maintenance_mode (
        id VARCHAR(64) PRIMARY KEY,
        entity_id VARCHAR(64) NOT NULL,
        entity_name VARCHAR(255) NOT NULL,
        entity_type VARCHAR(100) NOT NULL,
        start_time TIMESTAMP NOT NULL,
        end_time TIMESTAMP NOT NULL,
        status ENUM('scheduled', 'active', 'expired', 'cancelled') NOT NULL DEFAULT 'scheduled',
        suppress_alerts BOOLEAN NOT NULL DEFAULT TRUE,
        suppress_incidents BOOLEAN NOT NULL DEFAULT TRUE,
        notes TEXT NULL,
        created_by VARCHAR(100) NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_maintenance_entity (entity_id, status, start_time, end_time)
      );
    `);
    console.log("Table 'maintenance_mode' ready.");

    // Create assets table with all real tracking columns
    await connection.query(`
      CREATE TABLE IF NOT EXISTS assets (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        parent_type VARCHAR(100),
        sub_type VARCHAR(100),
        target_endpoint VARCHAR(512),
        environment VARCHAR(50),
        device_category VARCHAR(50),
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
      `ALTER TABLE assets ADD COLUMN IF NOT EXISTS device_category VARCHAR(50) NULL`,
    ];
    for (const sql of alterColumns) {
      try { await connection.query(sql); } catch (_) { /* column already exists */ }
    }
    console.log("Table 'assets' ready.");

    await connection.query(`
      CREATE TABLE IF NOT EXISTS app_settings (
        scope_key VARCHAR(120) PRIMARY KEY,
        settings_json JSON NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      );
    `);
    // Resize scope_key if still VARCHAR(50) from an older install
    try {
      await connection.query(
        `ALTER TABLE app_settings MODIFY COLUMN scope_key VARCHAR(120) NOT NULL`
      );
    } catch { /* already the right size or alter not needed */ }
    await connection.query(
      `INSERT INTO app_settings (scope_key, settings_json)
       VALUES ('admin', JSON_OBJECT())
       ON DUPLICATE KEY UPDATE scope_key = scope_key`
    );
    console.log("Table 'app_settings' ready.");

    await connection.query(`
      CREATE TABLE IF NOT EXISTS rackpoint_racks (
        id VARCHAR(64) PRIMARY KEY,
        name VARCHAR(120) NOT NULL,
        dc_id VARCHAR(64) NOT NULL,
        dc_name VARCHAR(255) NOT NULL,
        rack_type ENUM('42U', '45U', '48U') NOT NULL,
        total_u INT NOT NULL,
        location VARCHAR(255) NOT NULL,
        power_draw VARCHAR(60) NULL,
        created_by VARCHAR(100) NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_rackpoint_rack_name (dc_id, name),
        INDEX idx_rackpoint_dc (dc_id, dc_name)
      );
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS rackpoint_devices (
        id VARCHAR(64) PRIMARY KEY,
        rack_id VARCHAR(64) NOT NULL,
        name VARCHAR(160) NOT NULL,
        serial_number VARCHAR(160) NULL,
        hostname VARCHAR(255) NULL,
        type ENUM('server', 'storage', 'network', 'firewall', 'loadbalancer', 'patch', 'kvm', 'ups', 'pdu') NOT NULL,
        u_start INT NOT NULL,
        u_size INT NOT NULL,
        vendor VARCHAR(120) NOT NULL,
        model VARCHAR(160) NOT NULL,
        ip VARCHAR(120) NULL,
        status ENUM('active', 'standby', 'maintenance', 'offline') NOT NULL DEFAULT 'active',
        availability_status ENUM('reachable', 'unreachable', 'unknown') NOT NULL DEFAULT 'unknown',
        availability_message VARCHAR(255) NULL,
        last_availability_latency_ms INT NULL,
        last_availability_checked_at TIMESTAMP NULL,
        role VARCHAR(255) NULL,
        specs TEXT NULL,
        created_by VARCHAR(100) NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_rackpoint_devices_rack_slot (rack_id, u_start),
        INDEX idx_rackpoint_devices_type (type, status),
        INDEX idx_rackpoint_devices_serial (serial_number),
        INDEX idx_rackpoint_devices_availability (availability_status, last_availability_checked_at)
      );
    `);

    const rackPointAlterColumns = [
      `ALTER TABLE rackpoint_devices ADD COLUMN IF NOT EXISTS serial_number VARCHAR(160) NULL AFTER name`,
      `ALTER TABLE rackpoint_devices ADD COLUMN IF NOT EXISTS availability_status ENUM('reachable', 'unreachable', 'unknown') NOT NULL DEFAULT 'unknown' AFTER status`,
      `ALTER TABLE rackpoint_devices ADD COLUMN IF NOT EXISTS availability_message VARCHAR(255) NULL AFTER availability_status`,
      `ALTER TABLE rackpoint_devices ADD COLUMN IF NOT EXISTS last_availability_latency_ms INT NULL AFTER availability_message`,
      `ALTER TABLE rackpoint_devices ADD COLUMN IF NOT EXISTS last_availability_checked_at TIMESTAMP NULL AFTER last_availability_latency_ms`,
    ];
    for (const sql of rackPointAlterColumns) {
      try { await connection.query(sql); } catch (_) { /* column already exists */ }
    }
    console.log("Tables 'rackpoint_racks' and 'rackpoint_devices' ready.");

    await connection.query(`
      CREATE TABLE IF NOT EXISTS data_centers (
        id VARCHAR(64) PRIMARY KEY,
        dc_code VARCHAR(64) NOT NULL,
        name VARCHAR(255) NOT NULL,
        type ENUM('colocation', 'shared', 'private') NOT NULL,
        dc_role ENUM('Primary', 'Disaster Recovery', 'Backup Site', 'Edge DC') NOT NULL,
        region VARCHAR(120) NOT NULL,
        region_group VARCHAR(120) NULL,
        country VARCHAR(120) NOT NULL,
        city VARCHAR(120) NOT NULL,
        address VARCHAR(255) NOT NULL,
        exact_address VARCHAR(255) NULL,
        owner_company VARCHAR(255) NOT NULL,
        business_unit VARCHAR(255) NULL,
        vendor_provider VARCHAR(255) NOT NULL,
        paired_dc_id VARCHAR(64) NULL,
        paired_dc_name VARCHAR(255) NULL,
        map_pos_x DECIMAL(5,2) NULL,
        map_pos_y DECIMAL(5,2) NULL,
        contact_person VARCHAR(160) NOT NULL,
        contact_email VARCHAR(255) NOT NULL,
        contact_phone VARCHAR(50) NULL,
        noc_phone VARCHAR(50) NOT NULL,
        noc_email VARCHAR(255) NOT NULL,
        operational_work_hours ENUM('9-5', '8-6', '24x7', '24x5') NULL DEFAULT '24x7',
        visitor_access_required ENUM('Yes', 'No') NOT NULL DEFAULT 'No',
        visitor_name VARCHAR(160) NULL,
        visitor_phone VARCHAR(50) NULL,
        visitor_official_email VARCHAR(255) NULL,
        visitor_vendor VARCHAR(255) NULL,
        visit_duration VARCHAR(120) NULL,
        visitor_special_instructions TEXT NULL,
        emergency_contact_name VARCHAR(160) NULL,
        emergency_contact_phone VARCHAR(50) NOT NULL,
        emergency_contact_email VARCHAR(255) NULL,
        created_by VARCHAR(100) NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_data_centers_dc_code (dc_code),
        INDEX idx_data_centers_region (region_group, region, city),
        INDEX idx_data_centers_role (dc_role, type)
      );
    `);

    await ensureColumn(
      connection,
      databaseName,
      'data_centers',
      'map_pos_x',
      'ALTER TABLE data_centers ADD COLUMN map_pos_x DECIMAL(5,2) NULL AFTER paired_dc_name'
    );
    await ensureColumn(
      connection,
      databaseName,
      'data_centers',
      'map_pos_y',
      'ALTER TABLE data_centers ADD COLUMN map_pos_y DECIMAL(5,2) NULL AFTER map_pos_x'
    );
    await ensureColumn(
      connection,
      databaseName,
      'data_centers',
      'operational_work_hours',
      "ALTER TABLE data_centers ADD COLUMN operational_work_hours ENUM('9-5', '8-6', '24x7', '24x5') NULL DEFAULT '24x7' AFTER noc_email"
    );
    await ensureColumn(
      connection,
      databaseName,
      'data_centers',
      'visitor_access_required',
      "ALTER TABLE data_centers ADD COLUMN visitor_access_required ENUM('Yes', 'No') NOT NULL DEFAULT 'No' AFTER operational_work_hours"
    );
    await ensureColumn(
      connection,
      databaseName,
      'data_centers',
      'visitor_name',
      'ALTER TABLE data_centers ADD COLUMN visitor_name VARCHAR(160) NULL AFTER visitor_access_required'
    );
    await ensureColumn(
      connection,
      databaseName,
      'data_centers',
      'visitor_phone',
      'ALTER TABLE data_centers ADD COLUMN visitor_phone VARCHAR(50) NULL AFTER visitor_name'
    );
    await ensureColumn(
      connection,
      databaseName,
      'data_centers',
      'visitor_official_email',
      'ALTER TABLE data_centers ADD COLUMN visitor_official_email VARCHAR(255) NULL AFTER visitor_phone'
    );
    await ensureColumn(
      connection,
      databaseName,
      'data_centers',
      'visitor_vendor',
      'ALTER TABLE data_centers ADD COLUMN visitor_vendor VARCHAR(255) NULL AFTER visitor_official_email'
    );
    await ensureColumn(
      connection,
      databaseName,
      'data_centers',
      'visit_duration',
      'ALTER TABLE data_centers ADD COLUMN visit_duration VARCHAR(120) NULL AFTER visitor_vendor'
    );
    await ensureColumn(
      connection,
      databaseName,
      'data_centers',
      'visitor_special_instructions',
      'ALTER TABLE data_centers ADD COLUMN visitor_special_instructions TEXT NULL AFTER visit_duration'
    );

    await connection.query(`
      CREATE TABLE IF NOT EXISTS data_center_capacity (
        dc_id VARCHAR(64) PRIMARY KEY,
        building_type VARCHAR(80) NULL,
        redundancy_level VARCHAR(80) NULL,
        rack_total INT NOT NULL DEFAULT 0,
        rack_used INT NOT NULL DEFAULT 0,
        rack_available INT NOT NULL DEFAULT 0,
        power_capacity VARCHAR(120) NULL,
        ups_backup_duration VARCHAR(120) NULL,
        generator_capacity VARCHAR(160) NULL,
        primary_isp VARCHAR(160) NULL,
        secondary_isp VARCHAR(160) NULL,
        primary_bandwidth VARCHAR(120) NULL,
        secondary_bandwidth VARCHAR(120) NULL,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_data_center_capacity_racks (rack_used, rack_available)
      );
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS data_center_connectivity (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        source_dc_id VARCHAR(64) NOT NULL,
        target_dc_id VARCHAR(64) NULL,
        target_name VARCHAR(255) NOT NULL,
        region_group VARCHAR(120) NULL,
        line_variant ENUM('general-network', 'replication', 'bidirectional-replication', 'secondary-network') NOT NULL DEFAULT 'general-network',
        line_color VARCHAR(16) NOT NULL DEFAULT '#2563eb',
        line_style ENUM('direct', 'dotted') NOT NULL DEFAULT 'direct',
        connection_type ENUM('MPLS', 'Leased Line', 'VPN (IPSec)', 'SD-WAN') NOT NULL,
        bandwidth VARCHAR(120) NULL,
        latency_ms INT NULL,
        is_redundant TINYINT(1) NOT NULL DEFAULT 1,
        mode ENUM('Active-Active', 'Active-Passive') NOT NULL DEFAULT 'Active-Passive',
        replication_type ENUM('Synchronous', 'Asynchronous') NOT NULL DEFAULT 'Asynchronous',
        replication_tool VARCHAR(255) NULL,
        failover ENUM('Manual', 'Automatic') NOT NULL DEFAULT 'Manual',
        rto VARCHAR(80) NULL,
        rpo VARCHAR(80) NULL,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_data_center_connectivity (source_dc_id, target_name, line_variant),
        INDEX idx_data_center_connectivity_source (source_dc_id),
        INDEX idx_data_center_connectivity_target (target_dc_id, target_name)
      );
    `);
    await ensureColumn(
      connection,
      databaseName,
      'data_center_connectivity',
      'line_variant',
      "ALTER TABLE data_center_connectivity ADD COLUMN line_variant ENUM('general-network', 'replication', 'bidirectional-replication', 'secondary-network') NOT NULL DEFAULT 'general-network' AFTER region_group"
    );
    await ensureColumn(
      connection,
      databaseName,
      'data_center_connectivity',
      'line_color',
      "ALTER TABLE data_center_connectivity ADD COLUMN line_color VARCHAR(16) NOT NULL DEFAULT '#2563eb' AFTER region_group"
    );
    await ensureColumn(
      connection,
      databaseName,
      'data_center_connectivity',
      'line_style',
      "ALTER TABLE data_center_connectivity ADD COLUMN line_style ENUM('direct', 'dotted') NOT NULL DEFAULT 'direct' AFTER line_color"
    );
    const [connectivityIndexRows]: any = await connection.query(
      `SELECT GROUP_CONCAT(column_name ORDER BY seq_in_index SEPARATOR ',') AS columns_used
       FROM information_schema.statistics
       WHERE table_schema = ?
         AND table_name = 'data_center_connectivity'
         AND index_name = 'uniq_data_center_connectivity'`,
      [databaseName]
    );
    const currentConnectivityUnique = String(connectivityIndexRows?.[0]?.columns_used || '');
    if (currentConnectivityUnique !== 'source_dc_id,target_name,line_variant') {
      try {
        await connection.query('ALTER TABLE data_center_connectivity DROP INDEX uniq_data_center_connectivity');
      } catch {
        // ignore if index is not present yet
      }
      await connection.query(
        'ALTER TABLE data_center_connectivity ADD UNIQUE KEY uniq_data_center_connectivity (source_dc_id, target_name, line_variant)'
      );
    }

    await connection.query(`
      CREATE TABLE IF NOT EXISTS data_center_inventory (
        dc_id VARCHAR(64) PRIMARY KEY,
        physical_servers INT NOT NULL DEFAULT 0,
        virtualization_hosts INT NOT NULL DEFAULT 0,
        storage_arrays INT NOT NULL DEFAULT 0,
        network_devices INT NOT NULL DEFAULT 0,
        racks_occupied INT NOT NULL DEFAULT 0,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_data_center_inventory_footprint (racks_occupied, physical_servers, network_devices)
      );
    `);
    console.log("Tables 'data_centers', 'data_center_capacity', 'data_center_connectivity', and 'data_center_inventory' ready.");

    await connection.query(`
      CREATE TABLE IF NOT EXISTS portal_audit_logs (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        event_type ENUM('auth', 'action', 'security', 'system') NOT NULL,
        action VARCHAR(120) NOT NULL,
        actor_username VARCHAR(100) NULL,
        actor_role VARCHAR(30) NULL,
        target_type VARCHAR(80) NULL,
        target_id VARCHAR(160) NULL,
        severity ENUM('info', 'warning', 'critical') NOT NULL DEFAULT 'info',
        outcome ENUM('success', 'failed') NOT NULL DEFAULT 'success',
        resolved_at TIMESTAMP NULL,
        resolved_by VARCHAR(100) NULL,
        message VARCHAR(1024) NULL,
        details_json JSON NULL,
        ip_address VARCHAR(120) NULL,
        user_agent VARCHAR(512) NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await ensureIndex(
      connection,
      databaseName,
      'portal_audit_logs',
      'idx_portal_audit_created',
      'CREATE INDEX idx_portal_audit_created ON portal_audit_logs(created_at)'
    );
    await ensureIndex(
      connection,
      databaseName,
      'portal_audit_logs',
      'idx_portal_audit_actor',
      'CREATE INDEX idx_portal_audit_actor ON portal_audit_logs(actor_username, created_at)'
    );
    await ensureIndex(
      connection,
      databaseName,
      'portal_audit_logs',
      'idx_portal_audit_event',
      'CREATE INDEX idx_portal_audit_event ON portal_audit_logs(event_type, action, created_at)'
    );
    await ensureIndex(
      connection,
      databaseName,
      'portal_audit_logs',
      'idx_portal_audit_resolved',
      'CREATE INDEX idx_portal_audit_resolved ON portal_audit_logs(resolved_at, resolved_by)'
    );
    await ensureIndex(
      connection,
      databaseName,
      'portal_audit_logs',
      'idx_portal_audit_severity',
      'CREATE INDEX idx_portal_audit_severity ON portal_audit_logs(severity, outcome, created_at)'
    );
    console.log("Table 'portal_audit_logs' ready.");

    await connection.query(`
      CREATE TABLE IF NOT EXISTS portal_runtime_snapshots (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        frontend_url VARCHAR(512) NOT NULL,
        backend_url VARCHAR(512) NOT NULL,
        frontend_ok TINYINT(1) NOT NULL DEFAULT 0,
        frontend_status_code INT NOT NULL DEFAULT 0,
        frontend_latency_ms INT NOT NULL DEFAULT 0,
        backend_ok TINYINT(1) NOT NULL DEFAULT 0,
        backend_status_code INT NOT NULL DEFAULT 0,
        backend_latency_ms INT NOT NULL DEFAULT 0,
        portal_uptime_seconds BIGINT NULL,
        app_version VARCHAR(40) NULL,
        db_engine_name VARCHAR(40) NULL,
        db_engine_version VARCHAR(120) NULL,
        db_space_bytes BIGINT NULL,
        db_signature VARCHAR(128) NULL,
        db_uptime_seconds BIGINT NULL,
        vulnerability_total INT NOT NULL DEFAULT 0,
        vulnerability_info INT NOT NULL DEFAULT 0,
        vulnerability_low INT NOT NULL DEFAULT 0,
        vulnerability_moderate INT NOT NULL DEFAULT 0,
        vulnerability_high INT NOT NULL DEFAULT 0,
        vulnerability_critical INT NOT NULL DEFAULT 0,
        overall_status ENUM('healthy', 'degraded', 'critical') NOT NULL DEFAULT 'healthy',
        highest_severity ENUM('info', 'warning', 'critical') NOT NULL DEFAULT 'info',
        details_json JSON NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await ensureIndex(
      connection,
      databaseName,
      'portal_runtime_snapshots',
      'idx_portal_runtime_created',
      'CREATE INDEX idx_portal_runtime_created ON portal_runtime_snapshots(created_at)'
    );
    await ensureIndex(
      connection,
      databaseName,
      'portal_runtime_snapshots',
      'idx_portal_runtime_status',
      'CREATE INDEX idx_portal_runtime_status ON portal_runtime_snapshots(overall_status, highest_severity, created_at)'
    );
    console.log("Table 'portal_runtime_snapshots' ready.");

    // ── Users table ──────────────────────────────────────────────────────────
    const crypto = await import('node:crypto');
    const rootHash = crypto.createHash('sha256').update('Root@123').digest('hex');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(100) NOT NULL UNIQUE,
        full_name VARCHAR(255) NULL,
        employee_id VARCHAR(80) NULL,
        contact_number VARCHAR(50) NULL,
        email VARCHAR(255) NULL,
        password_hash VARCHAR(64) NOT NULL,
        password_updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        role ENUM('admin', 'staff', 'superuser', 'viewer') NOT NULL DEFAULT 'staff',
        team VARCHAR(120) NULL,
        company VARCHAR(255) NULL,
        manager_name VARCHAR(255) NULL,
        manager_email VARCHAR(255) NULL,
        account_status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
        rejection_reason VARCHAR(512) NULL,
        reviewed_by VARCHAR(100) NULL,
        reviewed_at TIMESTAMP NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      );
    `);
    await ensureColumn(
      connection,
      databaseName,
      'users',
      'full_name',
      'ALTER TABLE users ADD COLUMN full_name VARCHAR(255) NULL'
    );
    await ensureColumn(
      connection,
      databaseName,
      'users',
      'employee_id',
      'ALTER TABLE users ADD COLUMN employee_id VARCHAR(80) NULL'
    );
    await ensureColumn(
      connection,
      databaseName,
      'users',
      'contact_number',
      'ALTER TABLE users ADD COLUMN contact_number VARCHAR(50) NULL'
    );
    await ensureColumn(
      connection,
      databaseName,
      'users',
      'password_updated_at',
      'ALTER TABLE users ADD COLUMN password_updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP'
    );
    await ensureColumn(
      connection,
      databaseName,
      'users',
      'team',
      'ALTER TABLE users ADD COLUMN team VARCHAR(120) NULL'
    );
    await ensureColumn(
      connection,
      databaseName,
      'users',
      'company',
      'ALTER TABLE users ADD COLUMN company VARCHAR(255) NULL'
    );
    await ensureColumn(
      connection,
      databaseName,
      'users',
      'manager_name',
      'ALTER TABLE users ADD COLUMN manager_name VARCHAR(255) NULL'
    );
    await ensureColumn(
      connection,
      databaseName,
      'users',
      'manager_email',
      'ALTER TABLE users ADD COLUMN manager_email VARCHAR(255) NULL'
    );
    await ensureColumn(
      connection,
      databaseName,
      'users',
      'account_status',
      "ALTER TABLE users ADD COLUMN account_status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending'"
    );
    await ensureColumn(
      connection,
      databaseName,
      'users',
      'rejection_reason',
      'ALTER TABLE users ADD COLUMN rejection_reason VARCHAR(512) NULL'
    );
    await ensureColumn(
      connection,
      databaseName,
      'users',
      'reviewed_by',
      'ALTER TABLE users ADD COLUMN reviewed_by VARCHAR(100) NULL'
    );
    await ensureColumn(
      connection,
      databaseName,
      'users',
      'reviewed_at',
      'ALTER TABLE users ADD COLUMN reviewed_at TIMESTAMP NULL'
    );
    try {
      await connection.query("ALTER TABLE users MODIFY COLUMN role ENUM('admin', 'staff', 'superuser', 'viewer') NOT NULL DEFAULT 'staff'");
    } catch (_) {
      // Keep existing enum if migration fails on a specific MySQL variant.
    }
    await ensureIndex(
      connection,
      databaseName,
      'users',
      'uniq_users_email',
      'CREATE UNIQUE INDEX uniq_users_email ON users(email)'
    );
    await ensureIndex(
      connection,
      databaseName,
      'users',
      'uniq_users_employee_id',
      'CREATE UNIQUE INDEX uniq_users_employee_id ON users(employee_id)'
    );
    await connection.query(
      `INSERT INTO users (
          username, full_name, employee_id, contact_number, email,
         password_hash, password_updated_at, role, team, company, manager_name, manager_email,
          account_status
       )
       VALUES (
          'Root-user', 'Setup Admin', 'SU100', '1800-xxx-xxx', 'root@beacyn.com',
         ?, CURRENT_TIMESTAMP, 'superuser', 'NA', 'Beacyn Labs.', 'NA', 'NA', 'approved'
       )
       ON DUPLICATE KEY UPDATE
         full_name = VALUES(full_name),
         employee_id = VALUES(employee_id),
         contact_number = VALUES(contact_number),
         email = VALUES(email),
         password_hash = VALUES(password_hash),
         password_updated_at = CURRENT_TIMESTAMP,
         role = VALUES(role),
         team = VALUES(team),
         company = VALUES(company),
         manager_name = VALUES(manager_name),
         manager_email = VALUES(manager_email),
         account_status = 'approved'`,
      [rootHash]
    );

    await connection.query(`
      CREATE TABLE IF NOT EXISTS user_feedback (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(100) NOT NULL,
        email VARCHAR(255) NULL,
        category VARCHAR(80) NOT NULL DEFAULT 'general',
        rating INT NULL,
        message TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_user_feedback_user (username, created_at)
      );
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS status_pages (
        id VARCHAR(64) PRIMARY KEY,
        name VARCHAR(160) NOT NULL,
        group_name VARCHAR(160) NULL,
        components_json JSON NOT NULL,
        timezone VARCHAR(80) NOT NULL DEFAULT 'UTC',
        company_name VARCHAR(255) NOT NULL,
        page_address VARCHAR(255) NOT NULL,
        show_response_charts TINYINT(1) NOT NULL DEFAULT 1,
        public_token VARCHAR(96) NOT NULL,
        created_by VARCHAR(100) NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_status_pages_token (public_token),
        UNIQUE KEY uniq_status_pages_address (page_address),
        INDEX idx_status_pages_created (created_at)
      );
    `);
    console.log("Tables 'users', 'user_feedback', and 'status_pages' ready.");

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
    await ensureColumn(
      connection,
      databaseName,
      'agents',
      'serial_number',
      'ALTER TABLE agents ADD COLUMN serial_number VARCHAR(128) NULL'
    );
    await ensureIndex(
      connection,
      databaseName,
      'agents',
      'idx_agents_serial_number',
      'CREATE INDEX idx_agents_serial_number ON agents(serial_number)'
    );
    console.log("Table 'agents' ready.");

    await connection.query(`
      CREATE TABLE IF NOT EXISTS agent_metrics (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        agent_id VARCHAR(50) NOT NULL,
        serial_number VARCHAR(128) NULL,
        machine_type VARCHAR(20) NULL,
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
    await ensureColumn(
      connection,
      databaseName,
      'agent_metrics',
      'serial_number',
      'ALTER TABLE agent_metrics ADD COLUMN serial_number VARCHAR(128) NULL'
    );
    await ensureColumn(
      connection,
      databaseName,
      'agent_metrics',
      'machine_type',
      'ALTER TABLE agent_metrics ADD COLUMN machine_type VARCHAR(20) NULL'
    );
    await ensureIndex(
      connection,
      databaseName,
      'agent_metrics',
      'idx_agent_metrics_serial_number',
      'CREATE INDEX idx_agent_metrics_serial_number ON agent_metrics(serial_number)'
    );
    await ensureIndex(
      connection,
      databaseName,
      'agent_metrics',
      'idx_agent_metrics_machine_type',
      'CREATE INDEX idx_agent_metrics_machine_type ON agent_metrics(machine_type)'
    );
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
        work_notes LONGTEXT NULL,
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
        connection_utilization_pct DECIMAL(7,2) NULL,
        error_rate_pct DECIMAL(7,2) NULL,
        cpu_load_pct DECIMAL(7,2) NULL,
        memory_used_pct DECIMAL(7,2) NULL,
        disk_used_pct DECIMAL(7,2) NULL,
        host_pressure VARCHAR(20) NULL,
        capability_matrix_json JSON NULL,
        db_signature VARCHAR(255) NULL,
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
    await ensureColumn(
      connection,
      databaseName,
      'database_monitor_logs',
      'connection_utilization_pct',
      'ALTER TABLE database_monitor_logs ADD COLUMN connection_utilization_pct DECIMAL(7,2) NULL'
    );
    await ensureColumn(
      connection,
      databaseName,
      'database_monitor_logs',
      'error_rate_pct',
      'ALTER TABLE database_monitor_logs ADD COLUMN error_rate_pct DECIMAL(7,2) NULL'
    );
    await ensureColumn(
      connection,
      databaseName,
      'database_monitor_logs',
      'cpu_load_pct',
      'ALTER TABLE database_monitor_logs ADD COLUMN cpu_load_pct DECIMAL(7,2) NULL'
    );
    await ensureColumn(
      connection,
      databaseName,
      'database_monitor_logs',
      'memory_used_pct',
      'ALTER TABLE database_monitor_logs ADD COLUMN memory_used_pct DECIMAL(7,2) NULL'
    );
    await ensureColumn(
      connection,
      databaseName,
      'database_monitor_logs',
      'disk_used_pct',
      'ALTER TABLE database_monitor_logs ADD COLUMN disk_used_pct DECIMAL(7,2) NULL'
    );
    await ensureColumn(
      connection,
      databaseName,
      'database_monitor_logs',
      'host_pressure',
      'ALTER TABLE database_monitor_logs ADD COLUMN host_pressure VARCHAR(20) NULL'
    );
    await ensureColumn(
      connection,
      databaseName,
      'database_monitor_logs',
      'capability_matrix_json',
      'ALTER TABLE database_monitor_logs ADD COLUMN capability_matrix_json JSON NULL'
    );
    await ensureColumn(
      connection,
      databaseName,
      'database_monitor_logs',
      'db_signature',
      'ALTER TABLE database_monitor_logs ADD COLUMN db_signature VARCHAR(255) NULL'
    );
    console.log("Table 'database_monitor_logs' ready.");

    await connection.query(`
      CREATE TABLE IF NOT EXISTS snmp_devices (
        id VARCHAR(64) PRIMARY KEY,
        asset_id VARCHAR(50) NULL,
        name VARCHAR(255) NOT NULL,
        vendor VARCHAR(100) NULL,
        device_type VARCHAR(60) NOT NULL,
        host VARCHAR(255) NOT NULL,
        port INT NOT NULL DEFAULT 161,
        snmp_version ENUM('2c', '3') NOT NULL DEFAULT '2c',
        community VARCHAR(255) NULL,
        sec_username VARCHAR(255) NULL,
        auth_protocol ENUM('MD5', 'SHA', 'SHA224', 'SHA256', 'SHA384', 'SHA512') NULL,
        auth_key VARCHAR(255) NULL,
        priv_protocol ENUM('DES', 'AES', 'AES192', 'AES256') NULL,
        priv_key VARCHAR(255) NULL,
        context_name VARCHAR(255) NULL,
        enabled TINYINT(1) NOT NULL DEFAULT 1,
        poll_interval_sec INT NOT NULL DEFAULT 60,
        retention_hours INT NOT NULL DEFAULT 48,
        status VARCHAR(50) NOT NULL DEFAULT 'Unknown',
        last_polled_at TIMESTAMP NULL,
        last_error VARCHAR(512) NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_snmp_target (host, port),
        INDEX idx_snmp_enabled (enabled),
        INDEX idx_snmp_asset (asset_id),
        INDEX idx_snmp_vendor (vendor)
      );
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS snmp_telemetry_samples (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        device_id VARCHAR(64) NOT NULL,
        metric_key VARCHAR(120) NOT NULL,
        metric_value_num DECIMAL(20,4) NULL,
        metric_value_text VARCHAR(512) NULL,
        unit VARCHAR(30) NULL,
        oid VARCHAR(128) NOT NULL,
        severity VARCHAR(20) NOT NULL DEFAULT 'info',
        sample_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_snmp_samples_device_time (device_id, sample_time),
        INDEX idx_snmp_samples_metric_time (metric_key, sample_time)
      );
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS snmp_traps (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        device_id VARCHAR(64) NULL,
        source_ip VARCHAR(120) NOT NULL,
        trap_oid VARCHAR(128) NOT NULL,
        severity VARCHAR(20) NOT NULL DEFAULT 'warning',
        message VARCHAR(512) NULL,
        payload_json JSON NULL,
        received_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_snmp_traps_device_time (device_id, received_at),
        INDEX idx_snmp_traps_source_time (source_ip, received_at)
      );
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS syslog_events (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        device_id VARCHAR(64) NULL,
        source_ip VARCHAR(120) NOT NULL,
        hostname VARCHAR(255) NULL,
        app_name VARCHAR(120) NULL,
        facility INT NULL,
        severity INT NULL,
        severity_label VARCHAR(20) NULL,
        message VARCHAR(1024) NOT NULL,
        raw_message TEXT NULL,
        payload_json JSON NULL,
        received_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_syslog_device_time (device_id, received_at),
        INDEX idx_syslog_source_time (source_ip, received_at),
        INDEX idx_syslog_severity_time (severity_label, received_at)
      );
    `);

    await ensureColumn(
      connection,
      databaseName,
      'snmp_devices',
      'vendor',
      'ALTER TABLE snmp_devices ADD COLUMN vendor VARCHAR(100) NULL'
    );
    await ensureColumn(
      connection,
      databaseName,
      'snmp_devices',
      'retention_hours',
      'ALTER TABLE snmp_devices ADD COLUMN retention_hours INT NOT NULL DEFAULT 48'
    );
    await ensureColumn(
      connection,
      databaseName,
      'snmp_devices',
      'last_error',
      'ALTER TABLE snmp_devices ADD COLUMN last_error VARCHAR(512) NULL'
    );
    console.log("Table 'snmp_devices' ready.");

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
