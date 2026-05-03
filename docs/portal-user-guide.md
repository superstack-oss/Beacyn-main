# Beacyn Portal — User Guide

> **Version:** 2.x  
> **Last updated:** May 2026

---

## Table of Contents

1. [Getting Started](#1-getting-started)
2. [The Portal](#2-the-portal)
3. [Uptime Monitoring](#3-uptime-monitoring)
4. [Page Speed Monitoring](#4-page-speed-monitoring)
5. [Infrastructure Monitoring](#5-infrastructure-monitoring)
6. [Database Monitoring](#6-database-monitoring)
7. [Investigate](#7-investigate)
8. [Broadcast (Status Pages & Announcements)](#8-broadcast-status-pages--announcements)
9. [Data Centers & RackPoint](#9-data-centers--rackpoint)
10. [Access Management](#10-access-management)
11. [Troubleshooting with beacynctl](#11-troubleshooting-with-beacynctl)

---

## 1. Getting Started

### What is Beacyn?
Beacyn is a self-hosted, open-source monitoring and observability platform. It covers uptime, page speed, infrastructure, database health, SNMP, syslog, and more — all in one portal.

### System Requirements
- **Node.js** 20+ and npm
- **MySQL** 8.0+ (two databases: `pulseiq` and `bsa`)
- A Linux/macOS host or Docker/Podman runtime

### Installation Options

| Method | Command / File | Best for |
|---|---|---|
| Docker Compose | `docker-compose.yml` | Quickest evaluation |
| Podman Compose | `podman-compose.yml` | Rootless / air-gapped |
| Node.js (npm) | `npm run start` | Direct host control |
| GitHub source | `npm run dev` | Development / contribution |
| installer.sh | `bash install.sh` | Guided server setup |

### First-Time Setup (npm)
```bash
git clone <repository-url>
cd <project-root>
npm install
npm run initdb        # initialises pulseiq and bsa schemas
npm run dev           # starts frontend + API together
```
Open your browser at `http://localhost:5173`.

### First Login
- Default admin user is created during `initdb`.
- Log in and immediately change your password via **Settings → Security**.
- Set your timezone in **Settings → Profile**.

---

## 2. The Portal

### Dashboard Overview
The **Overview** page shows an at-a-glance health summary: active monitors, recent incidents, uptime percentages, and infrastructure alerts. Use it as your daily starting point.

### Navigation & Sidebar
| Section | Description |
|---|---|
| Overview | Global health summary |
| Uptime | Web monitors and status |
| Infrastructure | Server and device health |
| Database | DB instance monitoring |
| Investigate | ITIL ticketing |
| Broadcast | Status pages and announcements |
| Data Centers | Facility and rack management |
| Observability | AI-powered anomaly analysis |
| Settings / Admin | Users, RBAC, audit |

### Dark / Light Theme
Toggle from the top-right header icon. Preference is saved per browser session.

### Refresh Behaviour
The **Refresh** button in the header re-fetches live data for the active page without a full page reload.

---

## 3. Uptime Monitoring

### Monitor Types
| Type | Protocol | What it checks |
|---|---|---|
| HTTP/HTTPS | GET/POST | Status code, keyword, JSON path |
| Ping | ICMP | Reachability and round-trip time |
| TCP Port | TCP | Port open/closed state |
| SSL Certificate | TLS handshake | Certificate validity and expiry |
| Game Server | UDP/TCP | Player count and server metadata |

### Adding a Monitor
1. Go to **Uptime → Web Monitors** → **Add Monitor**.
2. Choose the monitor type.
3. Enter the URL or IP address, and select a check interval (15 s – 10 min).
4. Optionally configure keyword checks, expected status codes, or JSON-path assertions.
5. Assign notification channels and save.

### Check Intervals
- Minimum: **15 seconds**
- Maximum / custom: configurable per monitor
- Beacyn staggers checks to avoid burst load

### Alerts & Notification Channels
Configure notification channels under **Settings → Notifications**:
- **Email** — SMTP (configure host, port, credentials)
- **Slack** — Incoming webhook URL
- **Discord** — Server webhook URL
- **Webhook** — Any custom HTTP endpoint (POST, configurable payload)

Alerts fire on: status down, status recovered, SSL expiry threshold, and latency breach.

### Incidents & History
- Every status change creates an **Incident** record.
- View incident history, duration, and resolution timeline per monitor.
- Incidents link to the **Investigate** module for ticket creation.

### Status Pages
Public-facing status pages are managed in **Broadcast** (see §8).

---

## 4. Page Speed Monitoring

### What It Measures
Beacyn runs Lighthouse-based analysis to track:
- **Performance score** (0–100)
- **Core Web Vitals**: LCP, FID/INP, CLS
- **First Contentful Paint (FCP)**
- **Time to Interactive (TTI)**
- **Speed Index**
- Historical performance trends over time

### Adding a Page Speed Monitor
1. Go to **Uptime → Web Monitors** → **Add Monitor** → choose **Page Speed**.
2. Enter the target URL.
3. Set a check schedule (page speed checks are typically run less frequently than uptime — e.g. every 6–24 hours).
4. Save. Results appear in the **PageSpeed Details** view.

### Reading Results
- **Score cards** show the current Lighthouse scores at a glance.
- **Trend chart** shows score history over time — useful for spotting regressions after deployments.
- **Core Web Vitals breakdown** shows per-metric values and pass/fail thresholds.

### Alerts
Set threshold alerts for score drops (e.g. alert when performance score falls below 70).

---

## 5. Infrastructure Monitoring

### BeacynMonitorAgent™ (Collector)
Infrastructure monitoring requires the **BeacynMonitorAgent™** collector to be installed on each target server. The agent collects hardware metrics via a lightweight REST API and pushes them to the portal.

**What the agent collects:**
- CPU utilisation and temperature
- Memory usage (RAM + swap)
- Disk usage per mount point and S.M.A.R.T. status
- Network throughput (in/out per interface)
- Docker container status and resource usage
- Host uptime

**Installation:**
```bash
# Docker
docker run -d --name beacyn-agent \
  -e BEACYN_API_URL=http://<portal-host>:8080 \
  -e BEACYN_API_KEY=<your-key> \
  beacyn/monitor-agent

# Or download the script from the portal:
# Settings → Agent → Download installer
```

### SNMP Monitoring
Monitor network devices (switches, routers, UPS, etc.) without installing an agent.

1. Go to **Infrastructure → SNMP Devices** → **Add Device**.
2. Enter the device IP and SNMP version (v1 / v2c / v3).
3. For v3: provide auth protocol (MD5/SHA) and priv protocol (DES/AES), plus credentials.
4. Specify custom OIDs if you need metrics beyond the standard set.
5. Save. The portal polls the device on the configured interval.

**Standard metrics collected:** interface stats, CPU load OID, memory OID, uptime OID, device description.

### Syslog Monitoring
Receive and filter syslog streams from servers and network devices.

1. Configure your devices to forward syslog to the portal's IP on the configured UDP or TCP port.
2. In **Infrastructure → Syslog**, set severity filters (emergency → debug).
3. Define pattern-based alert rules (regex match on message content).
4. Matched events create alert records viewable in the portal.

See [syslog-integration.md](syslog-integration.md) for the full integration guide.

### Docker Monitoring
With the BeacynMonitorAgent™ running on a Docker host:
- Container state (running / exited / restarting) is monitored automatically.
- Resource usage (CPU %, memory %, network I/O) is tracked per container.
- Restart events create incident records.

### Viewing Server Dashboards
Navigate to **Infrastructure → [Server Name]** to see:
- Real-time and historical CPU, memory, and disk charts
- Network throughput trends
- Docker container list with health indicators
- Alert history for that host

---

## 6. Database Monitoring

### Supported Engines
| Engine | Connection | Query Insights | Table Metadata |
|---|---|---|---|
| MySQL | ✅ | ✅ | ✅ |
| PostgreSQL | ✅ | ✅ | ✅ |
| MongoDB | ✅ | Partial | ✅ |
| Oracle | ✅ | ✅ | ✅ |
| SQL Server | ✅ | ✅ | ✅ |

Monitoring requires the **BeacynMonitorAgent™** deployed with database access credentials.

### Connecting a Database Target
1. Go to **Database** → **Add Target**.
2. Select the engine type.
3. Provide host, port, database name, and read-only credentials.
4. The agent validates connectivity and begins collecting metrics.

### Health Dashboard
Each database target has a health dashboard showing:

| Metric | Description |
|---|---|
| Status | Connected / Disconnected / Degraded |
| QPS | Queries per second |
| Transactions/sec | Write transaction throughput |
| Threads running | Active query threads |
| Threads connected | Current connection count |
| Max connections | Configured connection limit |
| Connection errors | Failed connection attempts |
| Buffer cache hit % | InnoDB / shared_buffers cache efficiency |
| Deadlocks | Deadlock event count |
| Full table scans | Queries bypassing indexes |
| Lock wait (ms) | Average lock contention time |
| Bytes received / sent | Network throughput to/from the instance |
| Replication lag | Seconds behind primary (replica targets) |

### Query Insights
Navigate to **Database → [Target] → Query Insights** for digest-level analysis:

- **Top Slow Queries** — queries ranked by average execution time
- **Top Failed Queries** — queries with the highest error count
- **Top Large Row-Return Queries** — queries returning the most rows
- **All Queries table** — full digest list with count, avg ms, total ms, no-index flag
- **Latency comparison bar chart** — visual ranking of query digest latency
- **Query frequency area chart** — execution volume over time

### Table Metadata
Click any database name on the target dashboard to open the **Table Metadata** popup:
- Table name, engine, row count, data size, index size
- Last updated timestamp

### Engine-Specific Notes
- Metrics that are not supported on a given engine show **"Not supported on this engine"** rather than empty data.
- MongoDB does not expose Performance Schema; query insights rely on `db.currentOp()` and `serverStatus`.
- Oracle requires the `V$` view grants on the monitoring user.

---

## 7. Investigate

### What is Investigate?
Investigate is the built-in ITIL-oriented ticketing and incident management module. It lets teams track issues, assign owners, and manage resolution workflows — all linked to monitor data.

### Ticket Types
| Type | Use case |
|---|---|
| Incident | Unplanned disruption to a service |
| Service Request | Planned change or access request |
| Problem | Root-cause investigation for recurring incidents |

### Creating a Ticket
1. From any monitor detail page, click **Raise Ticket** or go to **Investigate → New**.
2. Select the ticket type and fill in title, description, and priority.
3. Assign to a team member and link to the affected monitor(s).
4. Set an SLA target if applicable.

### Ticket Lifecycle
`Open` → `In Progress` → `Resolved` → `Closed`

Status transitions are logged in the ticket timeline with timestamps and user attribution.

### ServiceNow Integration
For teams using ServiceNow:
1. Go to **Settings → Integrations → ServiceNow**.
2. Enter your ServiceNow instance URL, username, and API token.
3. Enable bidirectional sync or one-way push.
4. Incidents raised in Beacyn can be pushed to ServiceNow as incidents or service requests, and vice versa.

### RBAC on Tickets
- **Viewer** — read-only access to tickets
- **Editor** — create, update, comment
- **Admin** — full lifecycle control including close and delete

---

## 8. Broadcast (Status Pages & Announcements)

### Overview
Broadcast serves two purposes:
1. **Status Pages** — public-facing pages showing service health to end users or stakeholders
2. **Notifications / Announcements** — banner messages displayed on status pages (maintenance warnings, incident updates, etc.)

### Creating a Status Page
1. Go to **Broadcast** → **New Status Page**.
2. Fill in the page name, company name, and a custom page address slug.
3. Select the **components** to display (Servers, Storage, VMs, SAN, Database, Uptime).
4. Set the timezone and toggle response charts on/off.
5. Save. A shareable public URL is generated immediately.

**Public URL format:**
```
http://<your-host>/#broadcast/public/<token>
```

Copy the link from the Broadcast page to share with your users.

### Managing Status Pages
- **Edit** — update components, name, or settings at any time
- **Delete** — removes the page and its public URL
- **Copy link** — copies the public URL to clipboard

### Announcements / Notifications
Announcements appear as banners on status pages. They are useful for:
- Planned maintenance windows
- Ongoing incident updates
- Post-incident summaries

**To add an announcement:**
1. Click **Add Notification** next to the relevant status page (or **Global** for all pages).
2. Set the title, message, and severity:
   - `info` — blue banner (routine update)
   - `warning` — yellow banner (degraded performance)
   - `critical` — red banner (major incident)
3. Optionally set **publish at** and **remove at** timestamps for scheduled display.
4. Save. The banner appears on the status page immediately or at the scheduled time.

### Global vs. Page-Specific Announcements
- **Global** — shown on all status pages
- **Page-specific** — shown only on the selected status page

---

## 9. Data Centers & RackPoint

### Data Centers
Data Centers represent physical or logical facilities that contain your infrastructure.

**Adding a Data Center:**
1. Go to **Data Centers** → **New Data Center**.
2. Enter the facility name, location, and optional description.
3. Save. The data center becomes a container for rooms, rows, and racks.

### RackPoint
RackPoint is the physical asset location tracking module. It maps devices to their exact position in a rack.

**Adding a Rack:**
1. Inside a data center, create a **Rack** with a name and unit count (U size).
2. Racks can be organised into rows and rooms.

**Adding Devices:**
1. Open a rack and click **Add Device**.
2. Specify the device name, type, and the rack unit (U) position it occupies.
3. Devices are then visible in the rack diagram view.

### Bulk Import via CSV
RackPoint supports bulk device import:
1. Go to **RackPoint** → **Bulk Import** → **Download Template**.
2. Fill in the CSV template (columns: name, type, rack, startU, endU, etc.).
3. Upload the completed CSV — devices are created in bulk.

> **Note:** Only CSV format is supported. Excel (XLSX) files are not accepted.

### Use Cases
- Speed up physical audits
- Plan rack capacity before installing new equipment
- Track equipment moves during data center migrations
- Provide context for infrastructure incidents ("which rack is this server in?")

---

## 10. Access Management

### User Roles (RBAC)

| Role | Capabilities |
|---|---|
| **Admin** | Full access — manage users, settings, integrations, all data |
| **Editor** | Create and update monitors, tickets, and data; cannot manage users |
| **Viewer** | Read-only access to all sections |

### Inviting Users
1. Go to **Settings → Users** → **Invite User**.
2. Enter the email address and assign a role.
3. The user receives an email invitation to set up their account.

### Managing Users
- **User Details** — view last login, activity, and assigned role
- **Edit Role** — change role at any time
- **Deactivate** — revoke access without deleting the user record
- **Delete** — permanently removes the user

### Access Requests
If the portal is configured in **request-access mode**, users can submit access requests from the login page. Admins review and approve/deny them from **Admin → Access Requests**.

### Audit Log
Every action taken in the portal is logged:
- Who did it (user, email)
- What was done (create, update, delete, login, etc.)
- When (UTC timestamp)
- Which resource was affected

Go to **Admin → Audit Log** to search and filter the full audit trail.  
Go to **Admin → Audit Details** to drill into a specific event.

### Security Settings
- **Password policy** — minimum length enforced
- **Session management** — configurable session expiry
- **2FA** — if enabled, required at every login
- **Platform audit** — npm dependency vulnerability scan accessible from the portal

---

## 11. Troubleshooting with beacynctl

`beacynctl` is the built-in command-line management tool for Beacyn. It is installed automatically by `install.sh` and is available at `/usr/local/bin/beacynctl` or `~/.local/bin/beacynctl`.

### Checking Version
```bash
beacynctl version
```
Outputs: CLI version, app version, and active service manager.

---

### Service Control

| Command | What it does |
|---|---|
| `beacynctl start` | Start the Beacyn service |
| `beacynctl stop` | Stop the Beacyn service |
| `beacynctl restart` | Stop then start (full restart) |
| `beacynctl status` | Show service state, PIDs, ports, and HTTP status |
| `beacynctl status --json` | Same output in JSON format |
| `beacynctl health` | Returns `healthy` or `unhealthy` (exit 0/1) — useful for scripts |
| `beacynctl open` | Open frontend and backend URLs in the default browser |

---

### Logs

```bash
# Show last 80 lines of the log
beacynctl logs

# Follow logs in real time
beacynctl logs --follow
beacynctl logs -f

# Filter by component
beacynctl logs --component backend
beacynctl logs --component frontend

# Custom tail size
beacynctl logs --tail 200
```

---

### Diagnostics

```bash
# Full doctor report: status + validation + disk + Node/npm versions + recent logs
beacynctl doctor

# Run self-test (validate config + health check)
beacynctl self-test

# Validate that required files and binaries are present
beacynctl validate

# Security audit (npm audit + config file permissions)
beacynctl audit
```

---

### Configuration

```bash
# List all config values (app .env + CLI config)
beacynctl config list

# Get a specific key
beacynctl config get DB_HOST

# Set a key in the app .env
beacynctl config set DB_HOST localhost

# Unset a key
beacynctl config unset SOME_KEY

# Validate current configuration
beacynctl config validate

# Shorthand env aliases
beacynctl env list
beacynctl env get DB_HOST
beacynctl env set DB_HOST localhost
```

---

### Database Operations

```bash
# Backup schemas only (default)
beacynctl backup

# Backup with data
beacynctl backup --with-data

# Custom output directory
beacynctl backup --output /var/backups/beacyn

# Run database migrations (re-run initdb)
beacynctl migrate

# Reset a user's password
beacynctl reset-password --user Root-user --password <new-password>
```

---

### Maintenance Mode

```bash
# Enable maintenance mode (portal shows maintenance screen)
beacynctl maintenance on

# Disable maintenance mode
beacynctl maintenance off

# Check current state
beacynctl maintenance status
```

---

### Snapshots & Cleanup

```bash
# Create a diagnostic snapshot (status JSON + log tail + sanitised env)
beacynctl snapshot
beacynctl snapshot --output /tmp/beacyn-snapshots

# Clean up logs and cache
beacynctl cleanup --yes
beacynctl cleanup --scope logs --yes

# Clean up everything including database
beacynctl cleanup --yes --include-db
```

---

### Network Exposure

```bash
# Show recommended options for exposing Beacyn externally
beacynctl expose
```
Supported exposure methods: Cloudflare Tunnel, NGINX reverse proxy, ngrok.

---

### Uninstall

```bash
# Uninstall Beacyn (preserves data directory)
beacynctl uninstall --yes

# Uninstall and remove databases
beacynctl uninstall --yes --remove-db

# Uninstall and remove everything
beacynctl uninstall --yes --remove-db
```

> ⚠️ `--remove-db` permanently drops the `pulseiq` and `bsa` databases. Back up first with `beacynctl backup --with-data`.

---

### Quick Reference Card

```
beacynctl status
beacynctl health
beacynctl logs -f
beacynctl doctor
beacynctl restart
beacynctl backup
beacynctl snapshot
beacynctl maintenance on|off
beacynctl config list
beacynctl validate
beacynctl version
```
