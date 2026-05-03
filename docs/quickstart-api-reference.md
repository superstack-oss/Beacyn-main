# Quick Start, Dashboard Guide & API Reference

This document combines three resources into one:

- [Quick Start Guide](#quick-start-guide) — Get up and running in minutes
- [Understanding Dashboards](#understanding-dashboards) — What every view shows and how to read it
- [API Reference](#api-reference) — All REST endpoints with authentication requirements

---

## Quick Start Guide

### Prerequisites

- Beacyn is installed and running (see [Installation Guide](./installation.md))
- Frontend available at `http://localhost:7145` (dev) or your configured domain
- Backend API available at `http://localhost:5145`

---

### Step 1 — First Login

Open the portal in your browser. On first boot, a root administrator account is pre-seeded.

| Field | Default value |
|---|---|
| Username / Email | `Root-user` |
| Password | `Root@123` |

> **Security Notice**: Change the root password immediately after your first login.

1. Enter the username and password on the login screen.
2. Click **Sign In**.
3. You will land on the **Overview** dashboard.

To change your password immediately:

- Open the user menu (top-right avatar).
- Select **Change Password**.
- Enter your current password and a new strong password, then confirm.

Alternatively, use the CLI:

```bash
beacynctl reset-password
```

---

### Step 2 — Add Your First Uptime Monitor

1. Navigate to **Uptime** in the left sidebar.
2. Click **Add Monitor** (or the `+` button).
3. Select a monitor type:

   | Type | What it checks |
   |---|---|
   | **Website** | HTTP/HTTPS availability and response time |
   | **API Endpoint** | HTTP response code, latency, optional body match |
   | **Ping** | ICMP reachability |
   | **Port** | TCP port open/closed |
   | **SSL** | Certificate validity, expiry days remaining |
   | **Page Speed** | Lighthouse performance scores |
   | **Docker** | Container running state |
   | **Game Server** | Game server protocol query (GameDig) |
   | **gRPC** | gRPC health check |
   | **WebSocket** | WebSocket connection and echo |

4. Fill in the target URL or host, name, and check interval.
5. Click **Save**. The monitor is active immediately and the first probe result appears within 60 seconds.

---

### Step 3 — Connect a Database Target

Database monitoring requires a reachable MySQL, PostgreSQL, MongoDB, Oracle, or SQL Server instance.

1. Navigate to **Database** → **Targets** in the sidebar.
2. Click **Add Target**.
3. Enter the connection details:
   - **Label** — friendly display name
   - **Driver** — `mysql`, `postgres`, `mongodb`, `oracle`, `mssql`
   - **Host / Port**
   - **Username / Password**
   - **Database name** (optional — shows all databases if blank)
4. Click **Test & Save**. Beacyn immediately attempts a connection and reports health.

Query Insights (slow query detection, index usage analysis) become available once the first successful connection is established.

---

### Step 4 — Install BeacynMonitorAgent™ on a Server

The agent provides deep infrastructure metrics (CPU, memory, disk, processes, etc.) from servers that cannot be reached via SNMP or cloud APIs.

**On the target server** (Linux/macOS, requires Node.js 20+):

```bash
curl -sSL https://your-beacyn-host/agent-install.sh | bash
```

Or install manually:

```bash
npm install -g beacyn-agent
beacyn-agent config set endpoint https://your-beacyn-host:5145
beacyn-agent config set token  <your-push-token>
beacyn-agent start
```

The agent pushes heartbeat, metrics, and health data to:

| Endpoint | Purpose |
|---|---|
| `POST /api/agents/heartbeat` | Agent alive signal |
| `POST /api/agents/metrics` | CPU, memory, disk, network telemetry |
| `POST /api/agents/health` | Process / service health checks |

Once registered, the server appears under **Infrastructure** → **Servers**.

---

### Step 5 — Configure Notifications

1. Navigate to **Broadcast** → **Notifications** in the sidebar.
2. Click **Add Channel**.
3. Choose a channel type (email, Slack webhook, PagerDuty, generic webhook, etc.).
4. Configure the endpoint or credentials.
5. Associate channels with monitors via the monitor's **Alerts** tab.

Notifications fire when a monitor's status changes (Up → Down or Down → Up).

---

### Step 6 — Create a Public Status Page

1. Navigate to **Broadcast** → **Status Pages**.
2. Click **New Status Page**.
3. Enter a name and select which monitors to include.
4. Save — a unique public token URL is generated.
5. Share the public URL (no authentication required for viewers): `https://your-domain/status/:token`

---

## Understanding Dashboards

### Overview Page

**URL fragment**: `#/` (default landing page)

The Overview is an executive summary across all monitoring domains.

| Widget | Data shown |
|---|---|
| **Uptime Summary** | Total monitors, Up/Down/Paused counts, overall health percentage |
| **Infrastructure Summary** | Connected agents, server reachability status |
| **Database Summary** | Active DB targets, connection health |
| **Alert Feed** | Most recent incidents and state changes |
| **Response Trend** | Aggregated response time chart (last 24 h) |
| **Announcement Banner** | Any active broadcast announcements |

The data is sourced from `GET /api/overview` which aggregates counts and statuses from all domains in a single call.

---

### Uptime Page

**URL fragment**: `#/uptime`

Shows the full list of uptime monitors with live status.

| Column | Description |
|---|---|
| **Status badge** | Green (Up), Red (Down), Gray (Paused/Initializing) |
| **Monitor name** | User-defined label |
| **Type** | website, api, ping, port, ssl, pagespeed, docker, game, grpc, websocket |
| **Last check** | Timestamp of most recent probe |
| **Response time** | Latest measured latency in ms |
| **Uptime %** | Rolling availability percentage |

Click any row to open the **Service Details Sheet** — a side panel showing:

- 90-day uptime chart (hourly buckets)
- Response time trend graph
- Incident history (date, duration, type)
- Monitor configuration
- Run on-demand probe button

**Uptime % calculation**: `(up_count / total_checks) × 100` over the selected time window (default 90 days).

---

### Infrastructure Page

**URL fragment**: `#/infrastructure`

Displays servers and virtual machines managed by BeacynMonitorAgent™ or SNMP.

**Server list view**:

- Agent name / hostname
- Machine type (Physical / VM)
- Heartbeat status (green = active in last 90 s)
- Last seen timestamp

**Server detail view** (click a row):

| Tab | Content |
|---|---|
| **Overview** | CPU %, memory %, uptime, OS info |
| **Disks** | Mount points, used/free space, I/O stats |
| **Network** | Interface list, bytes in/out, packet stats |
| **Processes** | Top processes by CPU and memory |
| **Diagnostics** | Historical alerts and rule-based diagnostics |

Threshold alerts (e.g., CPU > 90% for 5 min) are configured per-server under **Diagnostics → Alert Rules**.

---

### Page Speed Page

**URL fragment**: `#/uptime` → monitor type filter: `pagespeed`

Pagespeed monitors run Google Lighthouse audits on a headless Chrome instance.

| Metric | Lighthouse audit |
|---|---|
| **Performance score** | Overall score 0–100 |
| **FCP** | First Contentful Paint |
| **LCP** | Largest Contentful Paint |
| **TBT** | Total Blocking Time |
| **CLS** | Cumulative Layout Shift |
| **TTI** | Time to Interactive |
| **Speed Index** | Visual loading speed |

Score bands: 0–49 (Poor, red), 50–89 (Needs Improvement, orange), 90–100 (Good, green).

Run an on-demand audit at any time from the Service Details Sheet or via `GET /api/monitor/pagespeed?url=<url>`.

---

### Database Monitoring Page

**URL fragment**: `#/database`

#### Connection Health Panel

Shows each database target with:

- Connection status (Connected / Error / Timeout)
- Driver type icon
- Host and port
- Last check timestamp
- Round-trip latency

#### Schema Explorer

Navigate `GET /api/databases/:targetKey/tables/:dbName` to list tables, row counts, index details, and sizes.

#### Query Insights

When enabled, Beacyn samples `performance_schema` (MySQL) or `pg_stat_statements` (PostgreSQL) to surface:

| Column | Description |
|---|---|
| **Query digest** | Normalized SQL pattern |
| **Avg latency** | Mean execution time (ms) |
| **Exec count** | Total executions in the sampling window |
| **Rows examined / sent** | Efficiency ratio |
| **Index hit rate** | Index vs. full-scan ratio |

Slow queries are flagged automatically and can generate Investigate tickets.

---

### Investigate Page

**URL fragment**: `#/investigate`

A built-in incident tracking system. Tickets are auto-created when monitors go down or diagnostic rules fire.

| Column | Description |
|---|---|
| **Ticket ID** | Auto-generated identifier |
| **Title** | Short description of the issue |
| **Severity** | critical / high / medium / low / info |
| **Status** | open / resolved |
| **Source** | Monitor or rule that triggered the ticket |
| **Created at** | Timestamp |
| **ServiceNow** | Deep-link to corresponding ServiceNow record (if configured) |

Click a ticket to view:

- Full description and diagnostic data
- Work notes (internal comments, append-only)
- Resolve button (logs resolution timestamp and actor)

---

### Broadcast Page

**URL fragment**: `#/broadcast`

**Status Pages sub-tab**: Lists all public status pages. Each shows:

- Page name
- Number of monitors included
- Public URL token
- Last updated timestamp

**Notifications sub-tab**: Lists all configured alert channels. Toggle a channel on/off with the active switch (calls `PUT /api/status-notifications/:id/active`).

---

### Data Centers & RackPoint Page

**URL fragment**: `#/datacenter`

**Data Centers** lists physical or virtual facility records:

- Name, location, tier classification
- Continuity map — drag-and-drop visual DR/failover topology

**RackPoint** is a visual rack layout editor:

- Create racks and assign devices to rack units (U positions)
- Import rack configurations from CSV/JSON

---

### Admin Panel

**URL fragment**: `#/admin`

Available to `admin` and `super_admin` roles only.

| Section | Purpose |
|---|---|
| **Team** | List users, approve/reject registration requests, change roles, suspend accounts |
| **Settings** | Portal-wide configuration (site name, SMTP, ServiceNow, Cloudflare, AI keys) |
| **Portal Audit** | Immutable log of all authentication and administrative events |
| **SNMP** | Manage SNMP v1/v2c/v3 device targets and view trap/telemetry history |
| **Syslog** | Ingest syslog messages forwarded to UDP port 5514 |

---

## API Reference

All API endpoints are served from the backend at port **5145** (default).

### Authentication

All endpoints (except `/api/auth/login`, `/api/auth/register`, and `/api/status-pages/public/:token`) require a Bearer token in the `Authorization` header.

```
Authorization: Bearer <session-token>
```

Tokens are returned by `POST /api/auth/login`. They are stored in the `sessions` table and validated on every request.

**Standard error responses**:

| HTTP | Meaning |
|---|---|
| `400` | Missing or invalid request parameters |
| `401` | Missing or invalid token |
| `403` | Insufficient role / account suspended |
| `404` | Resource not found |
| `500` | Internal server error |

---

### Auth

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/auth/login` | No | Authenticate with username/email/employee ID and password. Returns `{ token, user }`. |
| `POST` | `/api/auth/register` | No | Submit a registration request (pending admin approval). Body: `{ username, email, password, ... }`. |
| `POST` | `/api/auth/logout` | Yes | Invalidate the current session token. |
| `GET` | `/api/auth/me` | Yes | Return the authenticated user's profile. |
| `GET` | `/api/auth/my-team` | Yes | Return all users on the same team/portal. |
| `POST` | `/api/auth/profile` | Yes | Update display name, avatar, or contact info. |
| `POST` | `/api/auth/feedback` | Yes | Submit in-app feedback. Body: `{ message }`. |
| `POST` | `/api/auth/change-password` | Yes | Change password. Body: `{ currentPassword, newPassword }`. |
| `GET` | `/api/auth/requests` | Admin | List pending registration requests. |
| `POST` | `/api/auth/requests/:id/approve` | Admin | Approve a pending registration request. |
| `POST` | `/api/auth/requests/:id/reject` | Admin | Reject a registration request. Body: `{ reason }` (optional). |
| `PATCH` | `/api/auth/users/:id/role` | Admin | Change a user's role. Body: `{ role }`. |
| `PATCH` | `/api/auth/users/:id/status` | Admin | Suspend or reactivate a user. Body: `{ status }`. |
| `DELETE` | `/api/auth/users/:id` | Admin | Permanently delete a user account. |

---

### Assets (Uptime Monitors)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/assets` | Yes | List all monitors with latest status, response time, and uptime %. |
| `POST` | `/api/assets` | Yes | Create a new monitor. Body: monitor configuration object. |
| `PUT` | `/api/assets/:id` | Yes | Update monitor configuration. |
| `PUT` | `/api/assets/:id/status` | Yes | Pause or resume a monitor. Body: `{ status: "PAUSED" \| "ACTIVE" }`. |
| `DELETE` | `/api/assets/:id` | Yes | Delete a monitor and all its history. |
| `GET` | `/api/assets/:id/stats` | Yes | Return uptime stats for a monitor (hourly buckets, incident list). |
| `POST` | `/api/assets/:id/diagnostics/run` | Yes | Trigger an immediate diagnostic scan for a monitor. |
| `GET` | `/api/assets/:id/diagnostics/history` | Yes | Return historical diagnostic results. |
| `GET` | `/api/assets/:id/diagnostics/alerts/rules` | Yes | List alert threshold rules for a monitor. |
| `POST` | `/api/assets/:id/diagnostics/alerts/rules` | Yes | Add or update alert threshold rules. |
| `GET` | `/api/assets/:id/incidents/active` | Yes | Return any currently active (unresolved) incident for a monitor. |
| `GET` | `/api/assets/:id/logs` | Yes | Return raw probe log entries for a monitor. |

**Monitor object fields** (POST `/api/assets` body):

```json
{
  "name": "My Website",
  "parent_type": "website",
  "parent_url": "https://example.com",
  "check_interval_minutes": 5,
  "device_category": "uptime",
  "status": "ACTIVE"
}
```

---

### On-Demand Probes

These endpoints run a single probe immediately and return the result without storing it. Useful for manual checks or integrations.

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/monitor/website` | Yes | Run a website HTTP probe. Query: `?url=<url>` |
| `GET` | `/api/monitor/pagespeed` | Yes | Run a Lighthouse pagespeed audit. Query: `?url=<url>` |
| `GET` | `/api/monitor/docker` | Yes | Check a Docker host or container. Query: `?host=<host>` |
| `GET` | `/api/monitor/ping` | Yes | ICMP ping a host. Query: `?host=<host>` |
| `GET` | `/api/monitor/ssl` | Yes | Check SSL certificate. Query: `?host=<host>&port=443` |
| `GET` | `/api/monitor/port` | Yes | TCP port check. Query: `?host=<host>&port=<port>` |

**Example response** (`/api/monitor/website`):

```json
{
  "status": "Up",
  "statusCode": 200,
  "responseTime": 142,
  "redirectCount": 0,
  "timestamp": "2025-01-15T10:30:00.000Z"
}
```

---

### BeacynMonitorAgent™

These endpoints are called by the agent process running on monitored servers. They accept a Bearer token issued to the agent.

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/agents/heartbeat` | Agent token | Signal that the agent is alive. Body: `{ agentUuid, hostname }`. |
| `POST` | `/api/agents/metrics` | Agent token | Push system telemetry (CPU, memory, disk, network). |
| `POST` | `/api/agents/health` | Agent token | Push process/service health check results. |
| `GET` | `/api/agents` | Yes | List all registered agents with last-seen timestamps. |
| `DELETE` | `/api/agents/:agentUuid` | Admin | Deregister and remove an agent. |

---

### Infrastructure

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/infra` | Yes | Return combined infrastructure summary (agents + SNMP devices). |
| `GET` | `/api/infra/servers` | Yes | List all server agents with latest metrics snapshot. |
| `GET` | `/api/infra/servers/:agentId` | Yes | Return full detail for one server: CPU, memory, disks, network, processes. |
| `DELETE` | `/api/infra/servers/:agentId` | Admin | Remove a server and all its history. |
| `GET` | `/api/health/latest` | Yes | Return the latest health push payload for all agents. |

---

### Database Monitoring

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/databases` | Yes | List all database targets with connection status. |
| `GET` | `/api/databases/:targetKey` | Yes | Return full details for one target: schema list, query insights, recent errors. |
| `GET` | `/api/databases/:targetKey/tables/:dbName` | Yes | List tables in a specific database on the target, with row counts and sizes. |
| `DELETE` | `/api/databases/:targetKey` | Admin | Remove a database target. |
| `POST` | `/api/databases/ingest` | Agent token | Agent-push endpoint for database probe results. |

---

### Data Centers

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/datacenters` | Yes | List all data center records. |
| `GET` | `/api/datacenters/:id` | Yes | Return one data center with full detail. |
| `POST` | `/api/datacenters` | Admin | Create a new data center. |
| `PUT` | `/api/datacenters/:id` | Admin | Update a data center record. |
| `DELETE` | `/api/datacenters/:id` | Admin | Delete a data center record. |
| `GET` | `/api/datacenters/continuity-map` | Yes | Return the DR/continuity topology map JSON. |
| `PUT` | `/api/datacenters/continuity-map` | Admin | Save an updated continuity topology map. |

---

### RackPoint

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/rackpoint/racks` | Yes | List all rack definitions with device assignments. |
| `GET` | `/api/rackpoint/data-centers` | Yes | List data centers available for rack assignment. |
| `POST` | `/api/rackpoint/racks` | Admin | Create a new rack. Body: `{ name, dataCenterId, totalU }`. |
| `POST` | `/api/rackpoint/racks/:rackId/devices` | Admin | Add or update a device in a rack slot. |
| `POST` | `/api/rackpoint/import` | Admin | Bulk-import rack/device layout from JSON or CSV. |

---

### Status Pages (Broadcast)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/status-pages` | Yes | List all status pages (admin/internal view). |
| `POST` | `/api/status-pages` | Yes | Create a status page. Body: `{ name, monitorIds[] }`. |
| `PUT` | `/api/status-pages/:id` | Yes | Update a status page name or monitor list. |
| `DELETE` | `/api/status-pages/:id` | Admin | Delete a status page. |
| `GET` | `/api/status-pages/public/:token` | **No** | Public unauthenticated view. Returns monitors and current status for the page. |

The public endpoint is designed to be embedded in external dashboards or shared with customers — no auth token is required.

---

### Notifications

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/status-notifications` | Yes | List all configured notification channels. |
| `POST` | `/api/status-notifications` | Admin | Create a notification channel. Body: `{ type, name, config }`. |
| `PUT` | `/api/status-notifications/:id/active` | Admin | Enable or disable a channel. Body: `{ active: true \| false }`. |
| `DELETE` | `/api/status-notifications/:id` | Admin | Remove a notification channel. |

---

### Investigate (Incident Tickets)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/investigate` | Yes | List all incident tickets (open and resolved). |
| `GET` | `/api/investigate/:ticketId` | Yes | Return full detail for one ticket. |
| `PATCH` | `/api/investigate/:ticketId/resolve` | Yes | Mark a ticket as resolved. |
| `DELETE` | `/api/investigate/:ticketId` | Admin | Delete a ticket. |
| `GET` | `/api/investigate/:ticketId/servicenow-url` | Yes | Return the computed deep-link URL to the corresponding ServiceNow record. |
| `PATCH` | `/api/investigate/:ticketId/work-notes` | Yes | Append work notes to a ticket. Body: `{ note }`. |

---

### SNMP

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/snmp/devices` | Yes | List all SNMP-monitored devices. |
| `POST` | `/api/snmp/devices` | Admin | Add an SNMP device target. Body: `{ host, community, version, ... }`. |
| `PATCH` | `/api/snmp/devices/:id` | Admin | Update an SNMP device configuration. |
| `DELETE` | `/api/snmp/devices/:id` | Admin | Remove an SNMP device. |
| `POST` | `/api/snmp/devices/:id/poll` | Yes | Trigger an immediate SNMP poll for a device. |
| `GET` | `/api/snmp/telemetry` | Yes | Return the latest polled OID telemetry values. |
| `POST` | `/api/snmp/traps` | Internal | Receive an SNMP trap (called by the internal trap listener on UDP 9162). |
| `GET` | `/api/snmp/traps` | Yes | List received SNMP traps. |
| `GET` | `/api/snmp/events` | Yes | List SNMP-sourced events. |

---

### Syslog

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/syslog/ingest` | Internal | Ingest a syslog message. Called by the internal UDP 5514 listener or external forwarders. Body: `{ facility, severity, hostname, message, timestamp }`. |

External syslog forwarders (rsyslog, syslog-ng, etc.) can POST structured JSON to this endpoint over HTTP as an alternative to the UDP listener.

---

### Observability & AI

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/observability/summary` | Yes | Return an AI-generated narrative summary of current portal health. Requires OpenAI or Gemini configured in settings. |

---

### Portal Audit

The portal audit log records all authentication events, administrative actions, and system snapshots. Records are append-only and cannot be edited.

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/portal-audit` | Admin | List audit log entries (paginated, filterable). |
| `POST` | `/api/portal-audit/system-snapshot` | Admin | Store a point-in-time system state snapshot. |
| `POST` | `/api/portal-audit/system-event` | Admin | Manually log a custom audit event. |
| `GET` | `/api/portal-audit/:id` | Admin | Return a single audit record. |
| `PATCH` | `/api/portal-audit/:id/resolve` | Admin | Mark an audit alert as acknowledged/resolved. |
| `DELETE` | `/api/portal-audit/:id` | Admin | Remove an audit record (use with caution). |

---

### Settings

Portal-wide settings are stored in the `settings` table as key-value pairs.

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/settings` | Admin | Return all settings (SMTP, ServiceNow, Cloudflare, AI, branding, etc.). |
| `PUT` | `/api/settings` | Admin | Update one or more settings. Body: `{ key: value, ... }`. |
| `POST` | `/api/settings/reset` | Admin | Reset all settings to factory defaults. |

**Notable setting keys**:

| Key | Description |
|---|---|
| `portal_name` | Display name shown in the UI header |
| `smtp_host`, `smtp_port`, `smtp_user`, `smtp_pass` | Outbound email configuration |
| `servicenow_instance`, `servicenow_user`, `servicenow_pass` | ServiceNow REST integration |
| `cloudflare_tunnel_token` | Cloudflare Tunnel credential |
| `openai_api_key` | OpenAI key for AI observability |
| `gemini_api_key` | Google Gemini key for AI observability |

---

### Overview

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/overview` | Yes | Return aggregated counts and health status for all domains in one response. Used by the Overview dashboard. |

**Response shape**:

```json
{
  "uptime": { "total": 24, "up": 21, "down": 2, "paused": 1, "percent": 91.3 },
  "infrastructure": { "total": 8, "online": 7, "offline": 1 },
  "databases": { "total": 3, "connected": 3, "error": 0 },
  "recentAlerts": [ ... ]
}
```

---

### System / Health

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/system/portal-status` | No | Lightweight liveness probe — returns `{ status: "ok" }`. Used by the portal security monitor. |
| `GET` | `/health` | No | Express-level health check. Returns `{ status: "ok", uptime: <seconds> }`. |

These endpoints are intentionally unauthenticated to allow load-balancer health probes and monitoring systems to check availability without credentials.

---

### Role Reference

| Role | Level | Permissions |
|---|---|---|
| `viewer` | Read-only | View dashboards, monitors, tickets |
| `operator` | Standard | + Create/edit monitors, add work notes, run on-demand probes |
| `admin` | Elevated | + Manage users, settings, notifications, data centers |
| `super_admin` | Full | + All admin actions + uninstall and destructive operations |

---

### Common Request Examples

**Login and capture token (curl)**:

```bash
TOKEN=$(curl -s -X POST http://localhost:5145/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"Root-user","password":"Root@123"}' \
  | jq -r '.token')
```

**List all monitors**:

```bash
curl -s http://localhost:5145/api/assets \
  -H "Authorization: Bearer $TOKEN" | jq .
```

**Run an on-demand ping**:

```bash
curl -s "http://localhost:5145/api/monitor/ping?host=8.8.8.8" \
  -H "Authorization: Bearer $TOKEN" | jq .
```

**Get the overview dashboard data**:

```bash
curl -s http://localhost:5145/api/overview \
  -H "Authorization: Bearer $TOKEN" | jq .
```

**Resolve an incident ticket**:

```bash
curl -s -X PATCH http://localhost:5145/api/investigate/TKT-0042/resolve \
  -H "Authorization: Bearer $TOKEN" | jq .
```
