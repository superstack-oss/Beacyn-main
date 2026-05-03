# Health Checks

Health Checks are the core mechanism by which Beacyn measures and scores the real-time condition of every monitored infrastructure server. The BeacynMonitorAgent™ continuously collects a snapshot of key system metrics and writes them to the `health_checks` table. The API surfaces these snapshots for the dashboard, the server detail view, and the AI observability engine.

---

## How Health Checks Work

### Data Collection

The MonitorAgent runs on each monitored host and pushes a health snapshot to the API at regular intervals (default every 60 seconds). Each snapshot contains:

| Field | Description |
|---|---|
| `server_healthy` | Boolean — overall pass/fail health verdict |
| `cpu_usage_pct` | CPU utilization percentage |
| `memory_usage_pct` | Memory usage percentage |
| `cpu_temperature_c` | CPU temperature in degrees Celsius (if reported) |
| `network_latency_ms` | Round-trip latency to the monitoring server in milliseconds |
| `network_download_mbps` | Measured download throughput (Mbps) |
| `network_rx_mbps` | Network receive rate (Mbps) |
| `network_tx_mbps` | Network transmit rate (Mbps) |
| `failed_services_count` | Number of monitored services in a failed state |
| `hung_process_count` | Number of processes detected as hung |
| `payload_json` | Full structured payload including health score, scoring components, and issue reasons |
| `checked_at` | UTC timestamp when the snapshot was collected |

> **Timezone handling**: The agent always writes `checked_at` in UTC. The server resolves the correct UTC timestamp using the `collectedAt` ISO-8601 string inside `payload_json` if present, falling back to re-interpreting the database wall-clock value as UTC to prevent false staleness on servers in non-UTC timezones (e.g., IST UTC+5:30).

### Health Score

The `payload_json` contains a computed `summary` block with a numeric health score and status label:

| Status | Score Range | Meaning |
|---|---|---|
| `healthy` | 90 – 100 | All systems nominal |
| `degraded` | 60 – 89 | One or more metrics approaching threshold |
| `critical` | 0 – 59 | One or more metrics in critical state |

The `majorIssueReasons` array inside `summary` lists human-readable strings explaining why the score was penalized (e.g., `"High CPU usage: 94.2%"`, `"3 failed services detected"`).

### Scoring Components

The `payload_json.scoring.components` object breaks down each metric category's contribution to the final score. Each component has:

- `weight` — relative importance of this metric in the overall score
- `status` — `ok`, `warning`, or `critical`
- `metrics` — raw metric values for that component

This component breakdown is displayed in the **Server Detail → Overview** tab as a diagnostic scorecard.

---

## API Endpoints

### GET `/api/health/latest`

Returns the most recent health snapshot for every agent. Used by the Infrastructure list view to populate the health indicator column.

**Response**:

```json
{
  "health": [
    {
      "agentId": "agent-uuid",
      "healthy": true,
      "score": 92,
      "scoreStatus": "healthy",
      "latencyMs": 18,
      "checkedAt": "2026-05-02T07:15:00.000Z"
    }
  ]
}
```

| Field | Description |
|---|---|
| `agentId` | Agent UUID from the `agents` table |
| `healthy` | `true` if server_healthy = 1 |
| `score` | 0–100 health score from payload summary |
| `scoreStatus` | `healthy` / `degraded` / `critical` / `null` |
| `latencyMs` | Network round-trip latency at time of check |
| `checkedAt` | UTC timestamp of the check |

### GET `/api/infra/servers/:agentId`

Returns the full server detail including the latest health snapshot plus a trend history (default 48 checks, max 288). Used by the Server Detail view.

The health section of the response includes:

```json
{
  "health": {
    "serverHealthy": true,
    "score": 88,
    "scoreStatus": "degraded",
    "majorIssueReasons": ["Memory usage: 87.4%"],
    "scoringComponents": { ... },
    "cpuUsagePct": 34.1,
    "memoryUsagePct": 87.4,
    "cpuTemperatureC": 61,
    "networkLatencyMs": 12,
    "networkDownloadMbps": 420,
    ...
  }
}
```

The `healthTrend` array in the response contains the last N snapshots for charting network latency and download throughput over time.

---

## Monitoring Loop

The API server runs a **60-second monitoring loop** that:

1. Polls all registered monitors (uptime, API, ping, port, SSL, etc.) via `monitor-probe.ts`
2. Processes incoming agent health check payloads
3. Evaluates diagnostic alert rules against the latest metric snapshots
4. Creates `investigate_tickets` entries when threshold breaches are detected
5. Runs the AI observability analysis every 60 seconds (if a Gemini API key is configured)

This loop ensures that health data is never more than 60 seconds stale in the UI (the ticket list and infrastructure list both auto-refresh on the same 60-second cadence).

---

## Health Check Retention

Health check records are stored per-agent in the `health_checks` table. When an agent is deleted, all of its health check records are purged automatically:

```sql
DELETE FROM health_checks WHERE agent_id = ?
```

The server detail view queries up to **288 records** (equivalent to 4 hours at 60-second intervals, or 24 hours at 5-minute intervals) for the trend chart. The default query limit is **48** unless overridden by the `limit` query parameter.

---

## Stale Detection

The monitoring dashboard and server list use a **90-second staleness threshold** to determine if an agent is actively reporting:

- `last_seen_at < NOW() - INTERVAL 2 MINUTE` → agent heartbeat is set to `Inactive`
- `last_seen_at >= NOW() - INTERVAL 2 MINUTE` → agent heartbeat remains `Active`

The `GET /api/agents` endpoint calls `syncAgentHeartbeats()` before returning results to ensure the returned list always reflects the current online/offline state.

---

## Integration with Investigate Tickets

When the monitoring engine detects that a metric (CPU, memory, disk, network) has crossed a configured threshold, it automatically creates an investigation ticket in `investigate_tickets`. The ticket references the `agent_id` from the same health check that triggered the breach.

See [investigate.md](investigate.md) for full details on incident management.

---

## Integration with AI Observability

The health check data feeds directly into the **Observability Analysis** engine. Every 60 seconds, the engine aggregates:

- Down/degraded monitor counts
- Open diagnostic alert counts
- Critical infrastructure events
- Container stress events
- SNMP trap burst counts
- Critical syslog events

These are rolled into an **Operational Signal Heat** score (`low` / `moderate` / `high` / `critical`) and an **Overall Infrastructure Score** (0–100) shown on the Overview page.

The AI analysis window is **1 minute** by default, with a telemetry gap threshold of **60 minutes** (agents inactive for more than 60 minutes are flagged as having a telemetry gap).
