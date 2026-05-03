# Database Monitoring

This document covers:

- Installing and running DBMonitorAgent (Minitor DB)
- Target and persistence configuration
- Build and installer workflow
- Understanding all metrics displayed in [src/pages/main/database/DatabaseDetails.tsx](src/pages/main/database/DatabaseDetails.tsx)

## Installing DBMonitorAgent

# Minitor DB

Minitor DB is a standalone Go monitoring agent for database health and inventory collection. It runs under the `db` folder, collects database-side metrics for MySQL, PostgreSQL, MongoDB, Oracle, and SQL Server, writes JSON snapshots to stdout, and persists rows into `database_monitor_logs`.

## Defaults

- Binary name: `minitor-db`
- Agent name: `minitor-db`
- Default target: local MySQL on `localhost:3306`
- Default database: `pulseiq`
- Default user: `root`
- Default password: `madhumitaN8#`
- Default persistence table: `database_monitor_logs`

## Run locally

```bash
go run ./cmd/minitor-db
```

Run one collection cycle only:

```bash
DB_MONITOR_RUN_ONCE=true go run ./cmd/minitor-db
```

## Environment variables

- `DB_MONITOR_NAME` - agent name, default `minitor-db`
- `DB_MONITOR_INTERVAL` - collection interval, default `1m`
- `DB_MONITOR_RUN_ONCE` - run once and exit, default `false`
- `DB_MONITOR_TIMEOUT` - per-collection timeout, default `8s`
- `DB_MONITOR_TARGETS_JSON` - optional JSON array of targets
- `MYSQL_NAME` - MySQL target label, default `mysql-main`
- `MYSQL_HOST` - MySQL target host, default persistence host or `localhost`
- `MYSQL_PORT` - MySQL target port, default `3306`
- `MYSQL_DATABASE` - MySQL target database, default persistence database or `pulseiq`
- `MYSQL_USER` - MySQL target user, default persistence user or `root`
- `MYSQL_PASSWORD` - MySQL target password, default persistence password
- `POSTGRES_NAME` - PostgreSQL target label, default `postgres-main`
- `POSTGRES_HOST` - PostgreSQL host
- `POSTGRES_PORT` - PostgreSQL port, default `5432`
- `POSTGRES_DATABASE` - PostgreSQL database, default `postgres`
- `POSTGRES_USER` - PostgreSQL user
- `POSTGRES_PASSWORD` - PostgreSQL password
- `POSTGRES_URI` - PostgreSQL connection URI
- `MONGODB_NAME` - MongoDB target label, default `mongodb-main`
- `MONGODB_URI` - MongoDB connection URI
- `MONGODB_DATABASE` - MongoDB database, default `admin`
- `ORACLE_NAME` - Oracle target label, default `oracle-main`
- `ORACLE_URI` - Oracle connection URI
- `ORACLE_CONNECT_STRING` - Oracle connect string, for example `127.0.0.1:1521/XE`
- `ORACLE_HOST` - Oracle host
- `ORACLE_PORT` - Oracle port, default `1521`
- `ORACLE_DATABASE` - Oracle service or database name, default `XE`
- `ORACLE_USER` - Oracle username
- `ORACLE_PASSWORD` - Oracle password
- `ORACLE_PRIVILEGE` - Oracle privilege hint
- `SQLSERVER_NAME` - SQL Server target label, default `sqlserver-main`
- `SQLSERVER_HOST` - SQL Server host
- `SQLSERVER_PORT` - SQL Server port, default `1433`
- `SQLSERVER_DATABASE` - SQL Server database, default `master`
- `SQLSERVER_USER` - SQL Server username
- `SQLSERVER_PASSWORD` - SQL Server password
- `SQLSERVER_URI` - SQL Server connection string
- `SQLSERVER_CONNECTION_STRING` - alternate SQL Server connection string env
- `SQLSERVER_ENCRYPT` - SQL Server encrypt flag, default `false`
- `SQLSERVER_TRUST_CERT` - SQL Server trust certificate flag, default `true`
- `DB_MONITOR_DB_HOST` - persistence MySQL host, default `localhost`
- `DB_MONITOR_DB_PORT` - persistence MySQL port, default `3306`
- `DB_MONITOR_DB_NAME` - persistence MySQL database, default `pulseiq`
- `DB_MONITOR_DB_USER` - persistence MySQL user, default `root`
- `DB_MONITOR_DB_PASSWORD` - persistence MySQL password, default `madhumitaN8#`
- `DB_MONITOR_DB_TABLE` - persistence table, default `database_monitor_logs`
- `DB_MONITOR_SAVE_TO_DB` - persist snapshots, default `true`

## Build

```bash
make test
make build
make build-cross
```

## Installer

Install the db agent with the bundled service wrapper:

```bash
sh scripts/install.sh --engine mysql --database pulseiq --user root --password 'madhumitaN8#'
```

The installer writes `minitor-db.env`, installs `minitor-db`, and configures `systemd` or `launchd` when available.

## Security Note

The defaults above are development-friendly. For production:

- Change all default passwords
- Use least-privilege DB users per engine
- Restrict network access to DB ports
- Rotate credentials regularly

## Understanding Database Metrics

This section maps directly to what the UI renders in [src/pages/main/database/DatabaseDetails.tsx](src/pages/main/database/DatabaseDetails.tsx).

### Data refresh and source

- Detail page loads data from `GET /api/databases/:targetKey?limit=72`
- Auto-refresh interval is 60 seconds
- Table metadata popup loads from `GET /api/databases/:targetKey/tables/:dbName`
- The page reads capability flags (`capabilityMatrix`) to decide whether a metric is:
  - Supported
  - Not available due to permission/version
  - Not supported on this engine

### 1. Database Health Snapshot

Top-level target health:

- Target name
- Engine/type and version
- Connection status badge (`Connected`, `Unavailable`, or error states)
- Health category (`Healthy`, `Warning`, `Error`)
- Reachability (`Reachable` or `Unreachable`)
- Health reason text when degraded

Quick KPIs:

- Database uptime
- Total databases
- Active sessions
- Last collected timestamp

### 2. Host Diagnostics

OS-level pressure signals captured with DB snapshot:

- CPU load %
- Memory used %
- Disk used %
- Host pressure indicator

Each item includes support-state badges from capability matrix.

### 3. Info Summary

Consolidated infrastructure and node context:

- OS platform, distro, version, hostname
- Engine, version
- Node role and node state
- Replication lag
- Last collected time
- Space totals: total, used, free, used %

### 4. Core KPI Cards

Immediate performance/health indicators:

- Latency
- Active sessions
- Slow queries
- Lock contention

Each KPI can display:

- Severity state (for example: Good/Moderate/High)
- Support badge (Supported / Not available / Not supported)

### 5. Database Inventory

Per-database inventory view:

- Database name
- Table count
- Size in MB
- Inventory share (%)
- Health reason
- Health category

Summary rollups:

- Total databases
- Total tables
- Total inventory size

### 6. Table Metadata Popup

Per-table schema metadata (no row data):

- Table name
- Type (TABLE/VIEW)
- Engine
- Approx rows
- Data size
- Index size
- Row format
- Last update time

### 7. Node Status and Health

HA/replication posture:

- Role
- Node state
- Heartbeat
- Connection health
- Replication lag
- Replica IO running
- Replica SQL running
- Failover status
- Cluster quorum

### 8. Trend Charts

Time-series panels rendered on the page:

- Latency trend
- Sessions trend
- Query performance chart (QPS/TPS)
- QPS/TPS trend
- Connections and threads chart
- Connections trend
- InnoDB and storage engine chart
- Cache and memory chart

### 9. Performance Metrics

Detailed runtime telemetry cards include:

- Threads running
- Threads connected
- Questions
- Uptime (seconds)
- Wait events
- Buffer cache hit %
- Transactions/sec
- Bytes received
- Bytes sent
- Connection utilization %
- Error rate %
- QPS
- Cache hit ratio
- Deadlocks
- Mongo reads/sec
- Mongo writes/sec
- Oracle redo log usage %

### 10. Query Performance Metrics

Query-layer indicators:

- QPS
- TPS
- Average latency (ms)
- P95/P99 latency (ms)
- Slow queries
- Questions

### 11. Connections and Threads

Connection pressure and threading:

- Active connections
- Max connections
- Threads running
- Threads connected
- Connection errors
- Connection utilization %

### 12. InnoDB and Storage Engine Metrics

Storage-engine performance and pressure:

- Buffer pool hit ratio
- Reads vs writes per second
- Disk IO read/write (KB/s)
- Row lock time (ms)
- Pages read/written per second
- Buffer pool usage %

### 13. Locks and Contention

Contention diagnostics:

- Row locks
- Lock wait time (ms)
- Deadlocks
- Transactions waiting

### 14. Table and Index Metrics

Table/index health insights:

- Largest table
- Largest table size
- Top growth table
- Growth rate (MB/h)
- Full table scans
- No-index-used queries

### 15. Cache and Memory Metrics

Cache and memory pressure indicators:

- Buffer pool usage %
- Buffer pool data (MB)
- Query cache enabled/disabled
- Query cache hit ratio %
- Host memory used %
- Host memory used (MB)

### 16. Space Utilization

Storage capacity telemetry:

- Total DB size
- Used space
- Free space
- Used %
- Datafile growth
- Index bloat %
- Log usage %

### 17. ASM Disk Groups (Oracle)

Shown when ASM data exists:

- Disk group id
- Total MB
- Free MB
- Used %

## Engine-aware behavior

The UI is engine-aware and intentionally avoids misleading values:

- MySQL-only metrics show as unsupported on non-MySQL targets
- PostgreSQL-only metrics show as unsupported elsewhere
- MongoDB-only and Oracle-only metrics are similarly gated
- Missing values are rendered as `N/A` or capability warning labels instead of fake zeros

## Operational recommendations

- Keep `DB_MONITOR_INTERVAL` at 1m for balance between freshness and load
- Use `DB_MONITOR_RUN_ONCE=true` during validation and onboarding
- Grant only required diagnostic permissions per engine
- Treat capability warnings as permission/version signals, not immediate outages
- Use trend charts plus inventory table together when investigating growth regressions
