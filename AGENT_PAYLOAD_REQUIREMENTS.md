# Agent Payload Requirements for DatabaseDetails.tsx

This document outlines all UI sections in `DatabaseDetails.tsx` and the payload contract each section requires. Use this to configure your agent to capture complete data for all panels.

**Supported Engines:** MySQL, MongoDB, PostgreSQL, Oracle, SQL Server

---

## Overview Sections

### 1. Status & Health Badges (Top Bar)
**Purpose:** Connection status and overall health classification
**Required Fields:**
- `latest.status` - "Connected" | "Unavailable" | "Disconnected"
- `latest.healthCategory` - "Healthy" | "Warning" | "Error"
- `latest.ok` - boolean (reachability)

---

### 2. Database Health Snapshot (Card)
**Purpose:** Target identity, engine, version, and current status
**Required Fields:**
- `latest.targetName` - database target name
- `latest.targetType` - engine type (mysql, postgres, mongodb, oracle, sqlserver)
- `latest.engine` - engine label (MySQL, PostgreSQL, etc.)
- `latest.version` - version string
- `latest.status` - connection status
- `latest.healthCategory` - health state
- `latest.ok` - reachability
- `latest.healthReason` - issue description (if unhealthy)

---

### 3. Quick Stat Cards (Below Health Snapshot)
**Purpose:** Uptime, database count, active sessions, collection timestamp
**Required Fields:**
- `latest.databaseUptimeSec` - seconds since engine startup
- `latest.totalDatabases` - total database count
- `latest.activeSessions` - active connection/session count
- `latest.collectedAt` - ISO 8601 timestamp (UTC)

---

### 4. Host Diagnostics Card
**Purpose:** OS-level pressure (CPU, memory, disk)
**Required Fields:**
- `system.cpu.loadPct` - CPU load percentage (0–100)
- `system.memory.usedPct` - memory usage percentage
- `system.disk.usedPct` - disk usage percentage
- `system.hostPressure` - pressure indicator string (e.g., "Low", "Medium", "High")

---

### 5. Info Summary Card
**Purpose:** OS details, engine details, node health, space summary
**Required Fields:**
- `overview.osPlatform` - OS platform (Linux, Windows, macOS, etc.)
- `overview.osDistro` - OS distribution (Ubuntu, CentOS, etc.)
- `overview.osVersion` - OS version number
- `overview.hostname` - hostname
- `latest.engine` - engine name
- `latest.version` - engine version
- `latest.nodeRole` - replication role (Primary, Secondary, Standby, etc.)
- `latest.nodeState` - node operational state
- `latest.replicationLagSec` - replication lag in seconds
- `latest.totalSpaceMb` - total space in MB
- `latest.usedSpaceMb` - used space in MB
- `latest.freeSpaceMb` - free space in MB
- `latest.usedPct` - used space percentage

---

### 6. Quick Metric Badges (4-Column Grid)
**Purpose:** High-level metric status: Latency, Active Sessions, Slow Queries, Locks

| Metric | Field | Type | Notes |
|--------|-------|------|-------|
| Latency | `performance.latencyMs` | number | milliseconds; shown with state (Good/Moderate/High) |
| Active Sessions | `performance.activeSessions` | number | current count; state (Low/Normal/High) |
| Slow Queries | `performance.slowQueries` | number | count; state (Excellent/Warning) |
| Lock Contention | `performance.locks` OR `latest.lockCount` | number | count; state (No contention/Contention) |

**Support Paths (for capability matrix):**
- Latency: `capabilityMatrix.featureSupported.connectionHealthClassification`
- Sessions: `capabilityMatrix.featureSupported.connectionHealthClassification`
- Slow Queries: `capabilityMatrix.featureSupported.queryDiagnostics.mysql.slowQuerySampling` (MySQL-only)
- Locks: `capabilityMatrix.featureSupported.connectionHealthClassification`

---

### 7. Database Inventory Card + Modal
**Purpose:** List databases with table count, size, health; click to view table metadata

**Inventory List Fields:**
- `inventory.totalDatabases` - count
- `inventory.databases[]` - array of:
  - `id` - database identifier
  - `dbName` - database name
  - `tableCount` - table count
  - `sizeMb` - size in MB
  - `healthCategory` - "Healthy" | "Warning" | "Error"
  - `healthReason` - issue description

**Table Metadata Modal (via `/api/databases/:targetKey/tables/:dbName`):**
- `tables[]` - array of:
  - `tableName` - name
  - `tableType` - "TABLE" | "VIEW"
  - `engine` - storage engine (InnoDB, MyISAM, etc.)
  - `tableRows` - approximate row count
  - `avgRowLength` - average row size
  - `dataLength` - data size in bytes
  - `indexLength` - index size in bytes
  - `createTime` - ISO timestamp
  - `updateTime` - ISO timestamp
  - `tableComment` - table comment
  - `tableCollation` - collation
  - `rowFormat` - row format
  - `autoIncrement` - next auto-increment value

---

### 8. Node Status And Health Card
**Purpose:** HA, replication, failover, cluster status
**Required Fields:**
- `node.role` OR `latest.nodeRole` - Primary, Secondary, Standby, etc.
- `node.nodeState` OR `latest.nodeState` - operational state
- `node.heartbeat` - heartbeat indicator
- `node.connectionHealth` - connection health status
- `node.replicationLagSec` OR `latest.replicationLagSec` - lag in seconds
- `node.replicaIoRunning` - "Yes" | "No" | null
- `node.replicaSqlRunning` - "Yes" | "No" | null
- `node.failoverStatus` - failover state
- `node.clusterQuorum` - quorum status

---

## Performance Trend Charts (Large Area/Bar Charts)

### 9. Latency Trend
**Purpose:** Time-series latency history
**Required Fields:**
- `latencyTrend[]` - array of:
  - `time` - ISO timestamp
  - `value` - latency in milliseconds

---

### 10. Sessions Trend
**Purpose:** Time-series session/connection history
**Required Fields:**
- `sessionsTrend[]` - array of:
  - `time` - ISO timestamp
  - `value` - session count

---

### 11. Query Performance Chart (Area)
**Purpose:** Combined QPS and TPS trend
**Required Fields:**
- `qpsTrend[]` - array of:
  - `time` - ISO timestamp
  - `value` - queries per second
- `tpsTrend[]` - array of:
  - `time` - ISO timestamp
  - `value` - transactions per second

---

### 12. QPS/TPS Trend
**Purpose:** Simplified QPS and TPS trend (duplicate data from chart above)
**Required Fields:** Same as Query Performance Chart

---

### 13. Connections And Threads Chart (Bar)
**Purpose:** Connection pressure and thread activity snapshot
**Required Fields:**
- `performance.activeConnections` - active count (fallback: `threadsConnected`)
- `performance.maxConnections` - max allowed
- `performance.threadsRunning` - threads executing
- `performance.threadsConnected` - connected threads
- `performance.connectionErrors` - error count

**Support Path:** `capabilityMatrix.featureSupported.connectionHealthClassification`

---

### 14. Connections Trend (Area)
**Purpose:** Time-series active connections
**Required Fields:**
- `connectionsTrend[]` - array of:
  - `time` - ISO timestamp
  - `value` - connection count

---

### 15. InnoDB And Storage Engine Chart (Bar)
**Purpose:** Engine-specific read/write and page stats
**Required Fields:**
- `performance.innodb.readsPerSec` - reads per second
- `performance.innodb.writesPerSec` - writes per second
- `performance.innodb.pagesReadPerSec` - pages read per second
- `performance.innodb.pagesWrittenPerSec` - pages written per second
- `performance.bufferCacheHitPct` - buffer hit percentage

---

### 16. Cache And Memory Chart (Area)
**Purpose:** Time-series memory and cache utilization
**Required Fields:**
- `memoryTrend[]` - array of:
  - `time` - ISO timestamp
  - `value` - memory percentage
- `cpuTrend[]` - array of:
  - `time` - ISO timestamp
  - `value` - CPU percentage
- `bufferPoolUsageTrend[]` - array of:
  - `time` - ISO timestamp
  - `value` - buffer pool percentage
- `queryCacheHitTrend[]` - array of:
  - `time` - ISO timestamp
  - `value` - hit ratio percentage

---

## Performance Metrics Grid

### 17. Detailed Performance Metrics Card
**Purpose:** 15+ individual performance counters
**Required Fields (any missing shows "N/A"):**
- `performance.threadsRunning` - count
- `performance.threadsConnected` - count
- `performance.questions` - total questions
- `performance.uptimeSec` - engine uptime
- `performance.waitEvents` - wait count
- `performance.bufferCacheHitPct` - percentage
- `performance.transactionsPerSec` - TPS
- `performance.bytesReceived` - bytes (formatted as MB)
- `performance.bytesSent` - bytes (formatted as MB)
- `performance.connectionUtilizationPct` - percentage
- `performance.errorRatePct` - percentage
- `performance.qps` OR `performance.qpsRate` - queries per second
- `performance.cacheHitRatioPct` - percentage (PostgreSQL)
- `performance.deadlocks` - count (PostgreSQL)
- `performance.opcounters.readsPerSec` - MongoDB read/s
- `performance.opcounters.writesPerSec` - MongoDB write/s
- `performance.redoLogUsagePct` - percentage (Oracle)

---

## Query-Level Metrics

### 18. Query Performance Metrics Card
**Purpose:** Aggregated query performance KPIs
**Required Fields:**
- `performance.qps` - queries per second
- `performance.transactionsPerSec` OR `performance.transactionsPerSecRate` - TPS
- `performance.queryLatencyMs.avg` OR `performance.latencyMs` - avg latency
- `performance.queryLatencyMs.p95` - 95th percentile latency
- `performance.queryLatencyMs.p99` - 99th percentile latency
- `performance.slowQueries` - count
- `performance.questions` - total questions

---

### 19. Connections And Threads (Detailed) Card
**Purpose:** Connection pool and thread metrics
**Required Fields:**
- `performance.activeConnections` OR `performance.threadsConnected` - active
- `performance.maxConnections` - max
- `performance.threadsRunning` - running
- `performance.threadsConnected` - connected
- `performance.connectionErrors` - error count
- `performance.connectionUtilizationPct` - utilization %

---

### 20. InnoDB And Storage Engine Metrics Card
**Purpose:** Storage engine efficiency metrics
**Required Fields:**
- `performance.bufferCacheHitPct` - buffer hit %
- `performance.innodb.readsPerSec` - reads/s
- `performance.innodb.writesPerSec` - writes/s
- `performance.innodb.diskReadBytesPerSec` - disk read bytes/s (formatted as KB)
- `performance.innodb.diskWrittenBytesPerSec` - disk write bytes/s (formatted as KB)
- `performance.lockWaitMs` OR `performance.waitEvents` - wait ms
- `performance.innodb.pagesReadPerSec` - pages read/s
- `performance.innodb.pagesWrittenPerSec` - pages written/s
- `performance.innodb.bufferPoolUsagePct` - pool usage %

---

### 21. Locks And Contention Card
**Purpose:** Lock and transaction wait indicators
**Required Fields:**
- `diagnostics.locks.rowLocks` OR `performance.locks` - row lock count
- `diagnostics.locks.lockWaitTimeMs` OR `performance.lockWaitMs` - wait time ms
- `diagnostics.locks.deadlocks` OR `performance.deadlocks` - deadlock count
- `diagnostics.locks.transactionsWaiting` OR `performance.transactionsWaiting` - waiting transaction count

---

## Diagnostics Sections

### 22. Table And Index Metrics Card
**Purpose:** Heavy tables, growth, full-scan signals
**Required Fields:**
- `diagnostics.table.topTablesBySize[]` - array of:
  - `schemaName` - schema name
  - `tableName` - table name
  - `sizeMb` - size in MB
- `diagnostics.table.topGrowthTables[]` - array of:
  - `table` - table name
  - `growthRateMbPerHour` - growth rate
- `diagnostics.index.fullTableScans` - count OR `performance.fullTableScans`
- `diagnostics.index.noIndexUsedQueries` - count

**Support Path:** `capabilityMatrix.featureSupported.metrics.mysql.fullTableScans` (MySQL-only)

---

### 23. Cache And Memory Metrics Card
**Purpose:** Buffer pool and query cache efficiency
**Required Fields:**
- `performance.innodb.bufferPoolUsagePct` - pool usage %
- `performance.innodb.bufferPoolBytesData` - data bytes (formatted as MB)
- `performance.cache.queryCacheEnabled` - boolean
- `performance.cache.queryCacheHitRatioPct` - hit ratio %
- `performance.memory.hostMemoryUsedPct` - host memory % (fallback: `system.memory.usedPct`)
- `performance.memory.hostMemoryUsedMb` OR `system.memory.usedMb` - used MB

---

### 24. Query-Level Metrics (Insights) Card
**Purpose:** Performance Schema digest-level query insights
**Required Fields:**
- `diagnostics.query.topSlowQueries[]` - array of:
  - `digest` - query signature
  - `avgMs` - average execution time
- `diagnostics.query.topFailedQueries[]` - array of:
  - `digest` - query signature
  - `errors` - error count
- `diagnostics.query.topLargeQueries[]` - array of:
  - `digest` - query signature
  - `rowsExamined` - rows examined
- `diagnostics.query.performanceSchemaTopQueries[]` - array of:
  - `digest` - query signature
  - `count` - execution count
  - `avgMs` - average time
  - `totalMs` - total time
  - `noIndexUsed` - count (add with `noGoodIndexUsed`)

**Support Path:** `capabilityMatrix.featureSupported.queryDiagnostics.mysql.topRunningQueries` (MySQL-only)

---

### 25. Query Diagnostics Card
**Purpose:** Summary of long/slow and blocking queries
**Required Fields:**
- **Engine-specific long-running query fields:**
  - MySQL: `diagnostics.query.slowQuerySampling[]`
  - PostgreSQL: `diagnostics.query.longRunningQueries[]`
  - MongoDB: `diagnostics.query.currentOperations[]`
  - Oracle: (custom long-running sessions)
- `diagnostics.query.blockingQueries[]` - (PostgreSQL-only)

**Support Paths:**
- MySQL: `capabilityMatrix.featureSupported.queryDiagnostics.mysql.topRunningQueries`
- PostgreSQL: `capabilityMatrix.featureSupported.queryDiagnostics.postgres.longRunningQueries`
- MongoDB: `capabilityMatrix.featureSupported.queryDiagnostics.mongodb.currentOperations`
- Oracle: `capabilityMatrix.featureSupported.queryDiagnostics.oracle.topSessions`
- Blocking (PostgreSQL): `capabilityMatrix.featureSupported.queryDiagnostics.postgres.blockingQueries`

---

### 26. Space Utilization Card
**Purpose:** Database space metrics and growth indicators
**Required Fields:**
- `space.totalMb` - total space
- `space.usedMb` - used space
- `space.freeMb` - free space
- `space.usedPct` - used percentage
- `space.datafileGrowthMb` - datafile growth (Oracle)
- `space.indexBloatPct` - index bloat percentage
- `space.logUsagePct` - log file usage percentage

---

## Optional/Engine-Specific Sections

### 27. ASM Disk Groups (Oracle-only)
**Purpose:** Oracle ASM group utilization
**Required Fields (if Oracle):**
- `asm.diskgroups[]` - array of:
  - `id` - group name
  - `totalMb` - total size
  - `freeMb` - free size
  - `usedPct` - used percentage

---

## Summary: Top Priority Fields to Populate

**Critical (blocks most panels):**
1. `latest.*` — target identity, status, uptime, session count
2. `performance.*` — latency, sessions, QPS, locks, connections
3. Trend arrays — `latencyTrend`, `sessionsTrend`, `qpsTrend`, `tpsTrend`, `connectionsTrend`

**High Priority (enables diagnostics panels):**
4. `diagnostics.query.*` — slow, failed, large, performance schema queries
5. `diagnostics.table.*` & `diagnostics.index.*` — table/index metrics
6. `diagnostics.locks.*` — lock contention

**Medium Priority (enhances details):**
7. `system.*` — OS-level diagnostics
8. `node.*` — HA and replication
9. `space.*` — space utilization

**Low Priority (optional enhancers):**
10. `capabilityMatrix.*` — feature support flags (fallback: assume all supported if absent)
11. `asm.*` — Oracle-specific ASM disk groups

---

## Engine-Specific Notes

### MySQL
- Focus: `performance.qps`, `diagnostics.query.topRunningQueries`, `performance.innodb.*`, `performance.bufferCacheHitPct`
- Capability: `featureSupported.queryDiagnostics.mysql.topRunningQueries`, `featureSupported.metrics.mysql.fullTableScans`

### PostgreSQL
- Focus: `diagnostics.query.longRunningQueries`, `diagnostics.query.blockingQueries`, `performance.deadlocks`, `performance.cacheHitRatioPct`
- Capability: `featureSupported.queryDiagnostics.postgres.longRunningQueries`, `featureSupported.queryDiagnostics.postgres.blockingQueries`

### MongoDB
- Focus: `diagnostics.query.currentOperations`, `performance.opcounters.readsPerSec`, `performance.opcounters.writesPerSec`
- Capability: `featureSupported.queryDiagnostics.mongodb.currentOperations`, `featureSupported.metrics.mongodb.opcounters`

### Oracle
- Focus: `asm.diskgroups`, `space.logUsagePct`, `performance.redoLogUsagePct`
- Capability: `featureSupported.queryDiagnostics.oracle.topSessions`

### SQL Server
- Focus: Same core metrics as MySQL/PostgreSQL (no specialized section yet)

---

## Fallback & Graceful Degradation

If a field is missing or null:
- UI shows **"N/A"** for scalar values
- UI shows **"No data available from the latest snapshots."** for collections/arrays
- If engine is not supported: UI shows **"Not supported on this engine"**
- Unsupported + has data: UI shows **"Supported"** (green badge)
- Supported + no data: UI shows **"Not available (permission/version)"** (amber badge)

---

## Example Minimal Payload Contract

```json
{
  "latest": {
    "targetName": "prod-mysql-01",
    "targetType": "mysql",
    "engine": "MySQL",
    "version": "8.0.23",
    "status": "Connected",
    "ok": true,
    "healthCategory": "Healthy",
    "healthReason": null,
    "activeSessions": 42,
    "databaseUptimeSec": 2592000,
    "totalDatabases": 15,
    "collectedAt": "2026-04-29T14:30:00Z"
  },
  "performance": {
    "latencyMs": 45,
    "activeSessions": 42,
    "slowQueries": 0,
    "locks": 0,
    "qps": 1250,
    "transactionsPerSec": 320,
    "bufferCacheHitPct": 98.5,
    "connectionUtilizationPct": 42.0
  },
  "latencyTrend": [
    { "time": "2026-04-29T14:00:00Z", "value": 48 },
    { "time": "2026-04-29T14:05:00Z", "value": 45 }
  ],
  "sessionsTrend": [
    { "time": "2026-04-29T14:00:00Z", "value": 40 },
    { "time": "2026-04-29T14:05:00Z", "value": 42 }
  ],
  "qpsTrend": [
    { "time": "2026-04-29T14:00:00Z", "value": 1200 },
    { "time": "2026-04-29T14:05:00Z", "value": 1250 }
  ],
  "tpsTrend": [
    { "time": "2026-04-29T14:00:00Z", "value": 300 },
    { "time": "2026-04-29T14:05:00Z", "value": 320 }
  ],
  "inventory": {
    "totalDatabases": 15,
    "databases": [
      {
        "id": "db1",
        "dbName": "prod_app",
        "tableCount": 245,
        "sizeMb": 5120.50,
        "healthCategory": "Healthy"
      }
    ]
  },
  "capabilityMatrix": {
    "featureSupported": {
      "connectionHealthClassification": true,
      "queryDiagnostics": {
        "mysql": {
          "topRunningQueries": true,
          "slowQuerySampling": true
        }
      },
      "metrics": {
        "mysql": {
          "fullTableScans": true
        }
      }
    }
  }
}
```

---

## Template: Engine-Specific Payload Expansion

Expand the above minimal payload with engine-specific sections as needed:

- **MySQL additions:** `performance.innodb.*`, `performance.cache.*`, `diagnostics.query.performanceSchemaTopQueries`
- **PostgreSQL additions:** `diagnostics.query.blockingQueries`, `performance.deadlocks`
- **MongoDB additions:** `performance.opcounters.*`, `diagnostics.query.currentOperations`
- **Oracle additions:** `asm.diskgroups`, `space.logUsagePct`
- **All engines:** `diagnostics.locks.*`, `diagnostics.table.*`, `node.*`, `system.*`

Use this document as a specification for your agent payload generation.
