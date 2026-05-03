#!/usr/bin/env node

import process from 'process';
import os from 'os';
import { execSync } from 'child_process';
import mysql from 'mysql2/promise';

const RUNTIME = {
  intervalMs: Number(process.env.DB_MONITOR_INTERVAL_MS || 60000),
  runOnce: (process.env.DB_MONITOR_RUN_ONCE || 'false').toLowerCase() === 'true',
};

const DB = {
  host: process.env.DB_MONITOR_DB_HOST || process.env.PULSE_DB_HOST,
  user: process.env.DB_MONITOR_DB_USER || process.env.PULSE_DB_USER,
  password: process.env.DB_MONITOR_DB_PASSWORD || process.env.PULSE_DB_PASSWORD,
  database: process.env.DB_MONITOR_DB_NAME || process.env.PULSE_DB_NAME,
  table: process.env.DB_MONITOR_DB_TABLE || 'database_monitor_logs',
  enabled: (process.env.DB_MONITOR_SAVE_TO_DB || 'true').toLowerCase() !== 'false',
};

function nowIso() {
  return new Date().toISOString();
}

function run(command, timeoutMs = 3000) {
  try {
    const output = execSync(command, {
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: timeoutMs,
    }).toString().trim();
    return { ok: true, output };
  } catch {
    return { ok: false, output: '' };
  }
}

function detectOS() {
  const platform = os.platform();
  let distro = platform;
  let version = os.release();

  if (platform === 'linux') {
    const rel = run("cat /etc/os-release | awk -F= '/^PRETTY_NAME=/{gsub(/\"/,\"\",$2); print $2}'");
    if (rel.ok && rel.output) distro = rel.output;
    const ver = run("cat /etc/os-release | awk -F= '/^VERSION_ID=/{gsub(/\"/,\"\",$2); print $2}'");
    if (ver.ok && ver.output) version = ver.output;
  } else if (platform === 'darwin') {
    const rel = run('sw_vers -productVersion');
    distro = 'macOS';
    if (rel.ok && rel.output) version = rel.output;
  }

  return { platform, distro, version, hostname: os.hostname() };
}

function detectInstalledEngines() {
  return {
    mysql: run('command -v mysql').ok,
    postgres: run('command -v psql').ok,
    mongodb: run('command -v mongosh').ok || run('command -v mongo').ok,
    oracle: run('command -v sqlplus').ok,
  };
}

async function tryImport(moduleName) {
  try {
    const mod = await import(moduleName);
    return { ok: true, mod };
  } catch {
    return { ok: false, mod: null };
  }
}

function parseTargets() {
  if (process.env.DB_TARGETS_JSON) {
    try {
      const parsed = JSON.parse(process.env.DB_TARGETS_JSON);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // Fall through to env-based target discovery.
    }
  }

  const targets = [];

  if (process.env.MYSQL_HOST || process.env.MYSQL_URI) {
    targets.push({
      type: 'mysql',
      name: process.env.MYSQL_NAME || 'mysql-main',
      host: process.env.MYSQL_HOST,
      port: Number(process.env.MYSQL_PORT || 3306),
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DATABASE,
      uri: process.env.MYSQL_URI,
    });
  }

  if (process.env.POSTGRES_HOST || process.env.POSTGRES_URI) {
    targets.push({
      type: 'postgres',
      name: process.env.POSTGRES_NAME || 'postgres-main',
      host: process.env.POSTGRES_HOST,
      port: Number(process.env.POSTGRES_PORT || 5432),
      user: process.env.POSTGRES_USER,
      password: process.env.POSTGRES_PASSWORD,
      database: process.env.POSTGRES_DATABASE,
      uri: process.env.POSTGRES_URI,
    });
  }

  if (process.env.MONGODB_URI) {
    targets.push({
      type: 'mongodb',
      name: process.env.MONGODB_NAME || 'mongodb-main',
      uri: process.env.MONGODB_URI,
      database: process.env.MONGODB_DATABASE || 'admin',
    });
  }

  if (process.env.ORACLE_CONNECT_STRING || process.env.ORACLE_USER) {
    targets.push({
      type: 'oracle',
      name: process.env.ORACLE_NAME || 'oracle-main',
      user: process.env.ORACLE_USER,
      password: process.env.ORACLE_PASSWORD,
      connectString: process.env.ORACLE_CONNECT_STRING,
      privilege: process.env.ORACLE_PRIVILEGE,
    });
  }

  return targets;
}

function autoTargetsFromInstalled(installed) {
  const targets = [];

  if (installed.mysql) {
    targets.push({
      type: 'mysql',
      name: 'mysql-auto',
      host: process.env.MYSQL_HOST,
      port: Number(process.env.MYSQL_PORT || 3306),
      user: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DATABASE,
      uri: process.env.MYSQL_URI,
      autoDetected: true,
    });
  }

  if (installed.postgres) {
    targets.push({
      type: 'postgres',
      name: 'postgres-auto',
      host: process.env.POSTGRES_HOST || '127.0.0.1',
      port: Number(process.env.POSTGRES_PORT || 5432),
      user: process.env.POSTGRES_USER || process.env.USER,
      password: process.env.POSTGRES_PASSWORD || '',
      database: process.env.POSTGRES_DATABASE || 'postgres',
      uri: process.env.POSTGRES_URI,
      autoDetected: true,
    });
  }

  if (installed.mongodb) {
    targets.push({
      type: 'mongodb',
      name: 'mongodb-auto',
      uri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017',
      database: process.env.MONGODB_DATABASE || 'admin',
      autoDetected: true,
    });
  }

  if (installed.oracle && (process.env.ORACLE_CONNECT_STRING || process.env.ORACLE_USER)) {
    targets.push({
      type: 'oracle',
      name: process.env.ORACLE_NAME || 'oracle-auto',
      user: process.env.ORACLE_USER,
      password: process.env.ORACLE_PASSWORD,
      connectString: process.env.ORACLE_CONNECT_STRING,
      privilege: process.env.ORACLE_PRIVILEGE,
      autoDetected: true,
    });
  }

  return targets;
}

function normalizeDbInventory(entries) {
  const sorted = [...entries].sort((a, b) => (b.sizeMb || 0) - (a.sizeMb || 0));
  return sorted.map((e) => ({
    id: String(e.name || 'unknown'),
    dbName: String(e.name || 'unknown'),
    tableCount: Number(e.tableCount || 0),
    sizeMb: Number((Number(e.sizeMb || 0)).toFixed(2)),
  }));
}

function classifyTargetHealth(ok, performance = {}) {
  if (!ok) return 'Error';
  const latency = Number(performance?.latencyMs || 0);
  const slowQueries = performance?.slowQueries == null ? 0 : Number(performance.slowQueries);
  const locks = performance?.locks == null ? 0 : Number(performance.locks);

  if (latency > 250 || slowQueries > 0 || locks > 100) return 'Warning';
  return 'Healthy';
}

function classifyDatabaseHealth(targetHealth, db) {
  if (targetHealth === 'Error') return 'Error';
  if (db.tableCount <= 0) return 'Warning';
  if (db.sizeMb <= 0) return 'Warning';
  return targetHealth;
}

function buildCompactText(osInfo, results) {
  const head = `${osInfo.distro} ${osInfo.version}`;
  const lines = [];

  for (const r of results) {
    if (!r.ok) {
      lines.push(`${head}, ${r.target.type}: unavailable (${r.reason || r.error || 'unknown'})`);
      continue;
    }

    const dbCount = Number(r?.inventory?.totalDatabases || 0);
    const detail = (r?.inventory?.databases || [])
      .map((d) => `${d.dbName} has ${d.tableCount} tables (${d.healthCategory || 'Unknown'})`)
      .join(', ');
    const sizes = (r?.inventory?.databases || [])
      .map((d) => `${d.dbName} size: ${d.sizeMb}MB`)
      .join(', ');

    lines.push(`${head}, ${r.engine} ${r.version || 'unknown'}, Total dbs - ${dbCount}, Details: ${detail || 'N/A'}`);
    lines.push(`${sizes || 'No per-db size'}; Total DB size: ${r?.space?.totalMb ?? 'N/A'}MB`);
    lines.push(`Performance: health=${r?.healthCategory || 'Unknown'}, latency=${r?.performance?.latencyMs ?? 'N/A'}ms, activeSessions=${r?.performance?.activeSessions ?? r?.performance?.threadsConnected ?? 'N/A'}, slowQueries=${r?.performance?.slowQueries ?? 'N/A'}`);
  }

  return lines;
}

function unavailableResult(target, reason, hint = '') {
  return {
    target: { name: target.name || 'unknown', type: target.type },
    ok: false,
    status: 'Unavailable',
    healthCategory: 'Error',
    reason,
    hint,
    collectedAt: nowIso(),
  };
}

async function saveResultsToDb(osInfo, results) {
  if (!DB.enabled) return;

  let connection;
  try {
    connection = await mysql.createConnection({
      host: DB.host,
      user: DB.user,
      password: DB.password,
      database: DB.database,
    });

    const sql = `
      INSERT INTO ${DB.table}
      (target_key, target_name, target_type, engine, version, ok, status, node_role, node_state,
       database_uptime_sec, total_databases, total_tables, total_space_mb, used_space_mb, free_space_mb, used_pct,
       latency_ms, active_sessions, slow_queries, lock_count, replication_lag_sec,
       os_platform, os_distro, os_version, payload_json, collected_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    for (const r of results) {
      const totalTables = Array.isArray(r?.inventory?.databases)
        ? r.inventory.databases.reduce((sum, d) => sum + Number(d?.tableCount || 0), 0)
        : null;

      await connection.query(sql, [
        `${r?.target?.type || 'unknown'}:${r?.target?.name || 'unknown'}`,
        r?.target?.name || 'unknown',
        r?.target?.type || 'unknown',
        r?.engine || null,
        r?.version || null,
        r?.ok ? 1 : 0,
        r?.status || 'Unknown',
        r?.node?.role || null,
        r?.node?.nodeState || null,
        r?.databaseUptimeSec == null ? null : Number(r.databaseUptimeSec),
        r?.inventory?.totalDatabases == null ? null : Number(r.inventory.totalDatabases),
        totalTables == null ? null : Number(totalTables),
        r?.space?.totalMb == null ? null : Number(r.space.totalMb),
        r?.space?.usedMb == null ? null : Number(r.space.usedMb),
        r?.space?.freeMb == null ? null : Number(r.space.freeMb),
        r?.space?.usedPct == null ? null : Number(r.space.usedPct),
        r?.performance?.latencyMs == null ? null : Number(r.performance.latencyMs),
        r?.performance?.activeSessions == null ? null : Number(r.performance.activeSessions),
        r?.performance?.slowQueries == null ? null : Number(r.performance.slowQueries),
        r?.performance?.locks == null ? null : Number(r.performance.locks),
        r?.performance?.replicationLagSec == null ? (r?.node?.replicationLagSec == null ? null : Number(r.node.replicationLagSec)) : Number(r.performance.replicationLagSec),
        osInfo?.platform || null,
        osInfo?.distro || null,
        osInfo?.version || null,
        JSON.stringify(r),
        new Date(r?.collectedAt || nowIso()),
      ]);
    }
  } catch (err) {
    if (err?.code === 'ER_NO_SUCH_TABLE') {
      console.warn(`[db-monitor] Table ${DB.table} not found. Run initdb to create it.`);
    } else {
      console.warn('[db-monitor] Failed to store DB monitor results:', err?.message || err);
    }
  } finally {
    if (connection) await connection.end().catch(() => {});
  }
}

async function monitorMysql(target) {
  const imported = await tryImport('mysql2/promise');
  if (!imported.ok) {
    return unavailableResult(target, 'mysql2 driver not installed', 'npm i mysql2');
  }

  const mysql = imported.mod.default || imported.mod;
  const started = Date.now();
  let conn;

  try {
    conn = target.uri
      ? await mysql.createConnection(target.uri)
      : await mysql.createConnection({
          host: target.host,
          port: target.port || 3306,
          user: target.user,
          password: target.password,
          database: target.database,
          connectTimeout: 6000,
        });

    await conn.query('SELECT 1');
    const latencyMs = Date.now() - started;

    const [versionRows] = await conn.query('SELECT VERSION() AS version');
    const [statusRows] = await conn.query(
      "SHOW GLOBAL STATUS WHERE Variable_name IN ('Threads_running','Threads_connected','Slow_queries','Questions','Uptime','Com_commit','Com_rollback','Innodb_row_lock_time','Innodb_buffer_pool_read_requests','Innodb_buffer_pool_reads','Connections','Bytes_received','Bytes_sent')"
    );
    const statusMap = Object.fromEntries(statusRows.map((r) => [r.Variable_name, Number(r.Value || 0)]));

    const [replicaRows] = await conn.query('SHOW REPLICA STATUS').catch(() => [[], null]);
    const [slaveRows] = await conn.query('SHOW SLAVE STATUS').catch(() => [[], null]);
    const replica = Array.isArray(replicaRows) && replicaRows.length ? replicaRows[0] : (Array.isArray(slaveRows) && slaveRows.length ? slaveRows[0] : null);

    const [dbRows] = await conn.query(
      `SELECT
         table_schema AS schemaName,
         COUNT(*) AS tableCount,
         ROUND(SUM(data_length + index_length) / 1024 / 1024, 2) AS sizeMb
       FROM information_schema.tables
       WHERE table_schema NOT IN ('mysql','information_schema','performance_schema','sys')
       GROUP BY table_schema`
    );

    let dbInventory = normalizeDbInventory(dbRows.map((r) => ({
      name: r.schemaName,
      tableCount: Number(r.tableCount || 0),
      sizeMb: Number(r.sizeMb || 0),
    })));

    const totalMb = Number(dbInventory.reduce((s, d) => s + Number(d.sizeMb || 0), 0).toFixed(2));

    const uptimeSec = statusMap.Uptime || 0;
    const commits = statusMap.Com_commit || 0;
    const rollbacks = statusMap.Com_rollback || 0;
    const txPerSec = uptimeSec > 0 ? Number((((commits + rollbacks) / uptimeSec)).toFixed(4)) : null;
    const reads = statusMap.Innodb_buffer_pool_read_requests || 0;
    const misses = statusMap.Innodb_buffer_pool_reads || 0;
    const bufferCacheHitPct = reads > 0 ? Number((((reads - misses) / reads) * 100).toFixed(2)) : null;
    const [lockRows] = await conn.query('SELECT COUNT(*) AS lockCount FROM information_schema.innodb_trx').catch(() => [[{ lockCount: null }], null]);
    const lockCount = lockRows?.[0]?.lockCount == null ? null : Number(lockRows[0].lockCount);
    const performance = {
      latencyMs,
      activeSessions: statusMap.Threads_running || 0,
      threadsRunning: statusMap.Threads_running || 0,
      threadsConnected: statusMap.Threads_connected || 0,
      slowQueries: statusMap.Slow_queries || 0,
      questions: statusMap.Questions || 0,
      uptimeSec,
      locks: lockCount,
      waitEvents: statusMap.Innodb_row_lock_time || null,
      bufferCacheHitPct,
      transactionsPerSec: txPerSec,
      bytesReceived: statusMap.Bytes_received || 0,
      bytesSent: statusMap.Bytes_sent || 0,
    };
    const healthCategory = classifyTargetHealth(true, performance);
    dbInventory = dbInventory.map((d) => ({ ...d, healthCategory: classifyDatabaseHealth(healthCategory, d) }));

    return {
      target: { name: target.name, type: 'mysql' },
      engine: 'MySQL',
      version: String(versionRows?.[0]?.version || ''),
      databaseUptimeSec: uptimeSec,
      ok: true,
      status: 'Connected',
      healthCategory,
      collectedAt: nowIso(),
      node: {
        role: replica ? 'Replica' : 'Primary/Standalone',
        nodeState: 'Up',
        failoverStatus: null,
        clusterQuorum: null,
        heartbeat: 'ok',
        connectionHealth: 'ok',
        replicationLagSec: replica ? Number(replica.Seconds_Behind_Master || replica.Seconds_Behind_Source || 0) : null,
        replicaIoRunning: replica ? String(replica.Replica_IO_Running || replica.Slave_IO_Running || '') : null,
        replicaSqlRunning: replica ? String(replica.Replica_SQL_Running || replica.Slave_SQL_Running || '') : null,
      },
      performance,
      space: {
        totalMb,
        usedMb: null,
        freeMb: null,
        usedPct: null,
        datafileGrowthMb: null,
        indexBloatPct: null,
        logUsagePct: null,
      },
      inventory: {
        totalDatabases: dbInventory.length,
        databases: dbInventory,
      },
      asm: null,
    };
  } catch (err) {
    return {
      target: { name: target.name, type: 'mysql' },
      ok: false,
      status: 'Down',
      healthCategory: 'Error',
      error: err?.message || String(err),
      collectedAt: nowIso(),
    };
  } finally {
    if (conn) await conn.end();
  }
}

async function monitorPostgres(target) {
  const imported = await tryImport('pg');
  if (!imported.ok) {
    return unavailableResult(target, 'pg driver not installed', 'npm i pg');
  }

  const { Client } = imported.mod;
  const started = Date.now();
  const client = new Client(
    target.uri
      ? { connectionString: target.uri, connectionTimeoutMillis: 6000 }
      : {
          host: target.host,
          port: target.port || 5432,
          user: target.user,
          password: target.password,
          database: target.database,
          connectionTimeoutMillis: 6000,
        }
  );

  try {
    await client.connect();
    await client.query('SELECT 1');
    const latencyMs = Date.now() - started;

    const roleRes = await client.query('SELECT pg_is_in_recovery() AS in_recovery');
    const versionRes = await client.query('SELECT version() AS version');
    const upRes = await client.query("SELECT EXTRACT(EPOCH FROM (now() - pg_postmaster_start_time()))::bigint AS uptime_sec");
    const perfRes = await client.query('SELECT count(*)::int AS active_connections FROM pg_stat_activity');
    const lockRes = await client.query('SELECT count(*)::int AS lock_count FROM pg_locks');
    const dbRes = await client.query(
      `SELECT datname, pg_database_size(datname) AS bytes
       FROM pg_database
       WHERE datistemplate = false`
    );

    const dbDetails = [];
    for (const row of dbRes.rows) {
      const dbName = row.datname;
      const bytes = Number(row.bytes || 0);
      let tableCount = null;
      try {
        const temp = new Client(
          target.uri
            ? { connectionString: target.uri.replace(/\/[^/?]+(\?|$)/, `/${dbName}$1`), connectionTimeoutMillis: 4000 }
            : {
                host: target.host,
                port: target.port || 5432,
                user: target.user,
                password: target.password,
                database: dbName,
                connectionTimeoutMillis: 4000,
              }
        );
        await temp.connect();
        const t = await temp.query("SELECT count(*)::int AS c FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema')");
        tableCount = Number(t.rows[0]?.c || 0);
        await temp.end().catch(() => {});
      } catch {
        tableCount = null;
      }

      dbDetails.push({
        name: dbName,
        tableCount,
        sizeMb: Number((bytes / 1024 / 1024).toFixed(2)),
      });
    }

    let dbInventory = normalizeDbInventory(dbDetails);
    const totalMb = Number(dbInventory.reduce((s, d) => s + Number(d.sizeMb || 0), 0).toFixed(2));
    const performance = {
      latencyMs,
      activeSessions: Number(perfRes.rows[0]?.active_connections || 0),
      activeConnections: Number(perfRes.rows[0]?.active_connections || 0),
      locks: Number(lockRes.rows[0]?.lock_count || 0),
      slowQueries: null,
      waitEvents: null,
      bufferCacheHitPct: null,
      transactionsPerSec: null,
      replicationLagSec: null,
    };
    const healthCategory = classifyTargetHealth(true, performance);
    dbInventory = dbInventory.map((d) => ({ ...d, healthCategory: classifyDatabaseHealth(healthCategory, d) }));

    return {
      target: { name: target.name, type: 'postgres' },
      engine: 'PostgreSQL',
      version: String(versionRes.rows[0]?.version || ''),
      databaseUptimeSec: Number(upRes.rows[0]?.uptime_sec || 0),
      ok: true,
      status: 'Connected',
      healthCategory,
      collectedAt: nowIso(),
      node: {
        role: roleRes.rows[0]?.in_recovery ? 'Replica' : 'Primary/Standalone',
        nodeState: 'Up',
        failoverStatus: null,
        clusterQuorum: null,
        heartbeat: 'ok',
        connectionHealth: 'ok',
      },
      performance,
      space: {
        totalMb,
        usedMb: null,
        freeMb: null,
        usedPct: null,
        datafileGrowthMb: null,
        indexBloatPct: null,
        logUsagePct: null,
      },
      inventory: {
        totalDatabases: dbInventory.length,
        databases: dbInventory,
      },
      asm: null,
    };
  } catch (err) {
    return {
      target: { name: target.name, type: 'postgres' },
      ok: false,
      status: 'Down',
      healthCategory: 'Error',
      error: err?.message || String(err),
      collectedAt: nowIso(),
    };
  } finally {
    await client.end().catch(() => {});
  }
}

async function monitorMongo(target) {
  const imported = await tryImport('mongodb');
  if (!imported.ok) {
    return unavailableResult(target, 'mongodb driver not installed', 'npm i mongodb');
  }

  const { MongoClient } = imported.mod;
  const started = Date.now();
  const client = new MongoClient(target.uri, { serverSelectionTimeoutMS: 6000 });

  try {
    await client.connect();
    const admin = client.db('admin');
    const hello = await admin.command({ hello: 1 });
    const buildInfo = await admin.command({ buildInfo: 1 });
    const serverStatus = await admin.command({ serverStatus: 1 });
    const latencyMs = Date.now() - started;
    const dbList = await admin.admin().listDatabases();

    const dbDetails = [];
    for (const d of dbList.databases || []) {
      let tableCount = null;
      try {
        const cols = await client.db(d.name).listCollections({}, { nameOnly: true }).toArray();
        tableCount = cols.length;
      } catch {
        tableCount = null;
      }

      dbDetails.push({
        name: d.name,
        tableCount,
        sizeMb: Number((Number(d.sizeOnDisk || 0) / 1024 / 1024).toFixed(2)),
      });
    }

    let dbInventory = normalizeDbInventory(dbDetails);
    const totalMb = Number(dbInventory.reduce((s, d) => s + Number(d.sizeMb || 0), 0).toFixed(2));
    const performance = {
      latencyMs,
      activeSessions: Number(serverStatus?.connections?.current || 0),
      currentConnections: Number(hello?.connections?.current || 0),
      slowQueries: null,
      locks: null,
      waitEvents: null,
      bufferCacheHitPct: null,
      transactionsPerSec: null,
    };
    const healthCategory = classifyTargetHealth(true, performance);
    dbInventory = dbInventory.map((d) => ({ ...d, healthCategory: classifyDatabaseHealth(healthCategory, d) }));

    return {
      target: { name: target.name, type: 'mongodb' },
      engine: 'MongoDB',
      version: String(buildInfo?.version || ''),
      databaseUptimeSec: Number(serverStatus?.uptime || 0),
      ok: true,
      status: 'Connected',
      healthCategory,
      collectedAt: nowIso(),
      node: {
        role: hello?.isWritablePrimary ? 'Primary' : 'Secondary/Standalone',
        setName: hello?.setName || null,
        nodeState: 'Up',
        failoverStatus: null,
        clusterQuorum: null,
        heartbeat: 'ok',
        connectionHealth: 'ok',
      },
      performance,
      space: {
        totalMb,
        usedMb: null,
        freeMb: null,
        usedPct: null,
        datafileGrowthMb: null,
        indexBloatPct: null,
        logUsagePct: null,
      },
      inventory: {
        totalDatabases: dbInventory.length,
        databases: dbInventory,
      },
      asm: null,
    };
  } catch (err) {
    return {
      target: { name: target.name, type: 'mongodb' },
      ok: false,
      status: 'Down',
      healthCategory: 'Error',
      error: err?.message || String(err),
      collectedAt: nowIso(),
    };
  } finally {
    await client.close().catch(() => {});
  }
}

async function monitorOracle(target) {
  const imported = await tryImport('oracledb');
  if (!imported.ok) {
    return unavailableResult(target, 'oracledb driver not installed', 'npm i oracledb (plus Oracle Instant Client)');
  }

  const oracledb = imported.mod.default || imported.mod;
  let conn;
  const started = Date.now();

  try {
    conn = await oracledb.getConnection({
      user: target.user,
      password: target.password,
      connectString: target.connectString,
      privilege: target.privilege,
    });

    await conn.execute('SELECT 1 FROM dual');
    const latencyMs = Date.now() - started;

    const instance = await conn.execute(`SELECT status, instance_name, startup_time FROM v$instance`);
    const version = await conn.execute(`SELECT banner FROM v$version WHERE ROWNUM = 1`).catch(() => ({ rows: [['']] }));
    const space = await conn.execute(
      `SELECT ROUND(SUM(bytes)/1024/1024,2) AS total_mb
       FROM dba_data_files`
    ).catch(() => ({ rows: [[null]] }));
    const free = await conn.execute(
      `SELECT ROUND(SUM(bytes)/1024/1024,2) AS free_mb
       FROM dba_free_space`
    ).catch(() => ({ rows: [[null]] }));
    const asm = await conn.execute(
      `SELECT name, ROUND(total_mb,2) AS total_mb, ROUND(free_mb,2) AS free_mb FROM v$asm_diskgroup`
    ).catch(() => ({ rows: [] }));

    const pdbs = await conn.execute(
      `SELECT name FROM v$pdbs WHERE name NOT IN ('PDB$SEED')`
    ).catch(() => ({ rows: [] }));

    const schemaInventory = await conn.execute(
      `SELECT owner, COUNT(*) AS table_count, ROUND(SUM(bytes)/1024/1024,2) AS size_mb
       FROM dba_segments
       WHERE segment_type = 'TABLE'
       GROUP BY owner`
    ).catch(() => ({ rows: [] }));

    let dbInventory = normalizeDbInventory((schemaInventory.rows || []).map((r) => ({
      name: String(r[0] || 'unknown'),
      tableCount: Number(r[1] || 0),
      sizeMb: Number(r[2] || 0),
    })));

    if (!dbInventory.length && Array.isArray(pdbs.rows) && pdbs.rows.length) {
      dbInventory = normalizeDbInventory(pdbs.rows.map((r) => ({
        name: String(r[0] || 'unknown'),
        tableCount: 0,
        sizeMb: 0,
      })));
    }

    const totalMb = Number(space.rows?.[0]?.[0] || 0);
    const freeMb = Number(free.rows?.[0]?.[0] || 0);
    const performance = {
      latencyMs,
      activeSessions: null,
      slowQueries: null,
      locks: null,
      waitEvents: null,
      bufferCacheHitPct: null,
      transactionsPerSec: null,
      replicationLagSec: null,
    };
    const healthCategory = classifyTargetHealth(true, performance);
    dbInventory = dbInventory.map((d) => ({ ...d, healthCategory: classifyDatabaseHealth(healthCategory, d) }));

    return {
      target: { name: target.name, type: 'oracle' },
      engine: 'Oracle',
      version: String(version.rows?.[0]?.[0] || ''),
      databaseUptimeSec: instance.rows?.[0]?.[2]
        ? Math.floor((Date.now() - new Date(instance.rows[0][2]).getTime()) / 1000)
        : null,
      ok: true,
      status: 'Connected',
      healthCategory,
      collectedAt: nowIso(),
      node: {
        instanceName: instance.rows?.[0]?.[1] || null,
        instanceStatus: instance.rows?.[0]?.[0] || null,
        role: null,
        nodeState: 'Up',
        failoverStatus: null,
        clusterQuorum: null,
        heartbeat: 'ok',
        connectionHealth: 'ok',
      },
      performance,
      space: {
        totalMb,
        usedMb: null,
        freeMb: null,
        usedPct: null,
        datafileGrowthMb: null,
        indexBloatPct: null,
        logUsagePct: null,
      },
      inventory: {
        totalDatabases: pdbs.rows?.length ? Number(pdbs.rows.length) : (dbInventory.length || 1),
        databases: dbInventory,
      },
      asm: {
        diskgroups: (asm.rows || []).map((r, idx) => ({
          id: `asm-${idx + 1}`,
          totalMb: Number(r[1] || 0),
          freeMb: Number(r[2] || 0),
          usedPct: Number(r[1] || 0) > 0 ? Number((((Number(r[1]) - Number(r[2] || 0)) / Number(r[1])) * 100).toFixed(2)) : null,
        })),
      },
    };
  } catch (err) {
    return {
      target: { name: target.name, type: 'oracle' },
      ok: false,
      status: 'Down',
      healthCategory: 'Error',
      error: err?.message || String(err),
      collectedAt: nowIso(),
    };
  } finally {
    if (conn) await conn.close().catch(() => {});
  }
}

async function collectTarget(target) {
  if (target.type === 'mysql') return monitorMysql(target);
  if (target.type === 'postgres') return monitorPostgres(target);
  if (target.type === 'mongodb') return monitorMongo(target);
  if (target.type === 'oracle') return monitorOracle(target);
  return unavailableResult(target, `Unsupported target type: ${target.type}`);
}

async function collectAll() {
  const startedAt = nowIso();
  const osInfo = detectOS();
  const installedEngines = detectInstalledEngines();
  let targets = parseTargets();
  if (!targets.length) {
    targets = autoTargetsFromInstalled(installedEngines);
  }

  const results = await Promise.all(targets.map((t) => collectTarget(t)));

  const summary = {
    totalTargets: results.length,
    healthyTargets: results.filter((r) => r.ok).length,
    unhealthyTargets: results.filter((r) => !r.ok).length,
    installedEngines,
  };

  const compactOutput = buildCompactText(osInfo, results);

  const payload = {
    startedAt,
    collectedAt: nowIso(),
    os: osInfo,
    summary,
    compactOutput,
    results,
  };

  await saveResultsToDb(osInfo, results);

  console.log(JSON.stringify(payload, null, 2));
  return payload;
}

let running = false;

async function tick() {
  if (running) {
    console.warn('[db-monitor] Previous cycle still running. Skipping this tick.');
    return;
  }

  running = true;
  try {
    await collectAll();
  } catch (err) {
    console.error('[db-monitor] Collection failed:', err?.message || err);
  } finally {
    running = false;
  }
}

async function start() {
  console.log(`[db-monitor] Started. Interval: ${Math.round(RUNTIME.intervalMs / 1000)}s. Run once: ${RUNTIME.runOnce}.`);
  await tick();
  if (RUNTIME.runOnce) process.exit(0);

  setInterval(() => {
    void tick();
  }, RUNTIME.intervalMs);
}

start().catch((err) => {
  console.error('[db-monitor] Startup failed:', err?.message || err);
  process.exit(1);
});
