# Beacyn Platform — Architecture

> **Version:** 2.x  
> **Last updated:** May 2026

---

## Overview

Beacyn is a self-hosted, full-stack monitoring and observability platform. It runs as two co-located Node.js processes — a **Vite-served React SPA** for the frontend and an **Express 5 REST API** for the backend — backed by a **MySQL 8 relational database** and optionally extended by **remote collector agents** (BeacynMonitorAgent™).

```
┌──────────────────────────────────────────────────────────────────────────┐
│                          BEACYN HOST                                     │
│                                                                          │
│   ┌────────────────────┐        ┌──────────────────────────────────────┐ │
│   │   React SPA        │  HTTP  │   Express 5 API Server               │ │
│   │   (Vite / React 19)│◄──────►│   src/scripts/api/server.ts          │ │
│   │   Port 7145        │        │   Port 5145                          │ │
│   └────────────────────┘        │                                      │ │
│                                 │   ┌──────────────────┐               │ │
│                                 │   │  Monitor Engine  │               │ │
│                                 │   │  monitor-probe.ts│               │ │
│                                 │   └──────────────────┘               │ │
│                                 │   ┌──────────────────┐               │ │
│                                 │   │  Observability   │               │ │
│                                 │   │  AI Analysis     │               │ │
│                                 │   └──────────────────┘               │ │
│                                 └────────────────┬─────────────────────┘ │
│                                                  │                       │
│                                       ┌──────────▼──────────┐           │
│                                       │   MySQL 8            │           │
│                                       │   pulseiq  (app)     │           │
│                                       │   bsa      (assets)  │           │
│                                       └──────────────────────┘           │
└──────────────────────────────────────────────────────────────────────────┘
         ▲                    ▲                     ▲
         │ HTTP/REST          │ REST push            │ SNMP/UDP syslog
         │                    │                      │
┌────────┴──────┐  ┌──────────┴──────────┐  ┌───────┴────────────┐
│  Browser /    │  │ BeacynMonitorAgent™  │  │  Network Devices   │
│  End Users    │  │ (remote collector)  │  │  (switches, UPS…)  │
└───────────────┘  └─────────────────────┘  └────────────────────┘
```

---

## 1. Frontend

| Property | Value |
|---|---|
| Framework | React 19 + TypeScript |
| Build tool | Vite 8 |
| Styling | Tailwind CSS v4 (via `@tailwindcss/vite`) |
| UI components | shadcn/ui-style, Radix UI primitives, lucide-react |
| Charts | Recharts |
| Icons | HugeIcons (free) |
| Fonts | Geist Variable (`@fontsource-variable/geist`) |
| Routing | Client-side hash routing (no React Router) — handled in `src/App.tsx` |
| State | React local state + `sessionStorage` for cross-route persistence |
| API comms | Fetch (`src/lib/api.ts`) with `Authorization: Bearer <token>` headers |

### Key Source Directories

```
src/
├── App.tsx                  # Top-level router (hash-based, conditional rendering)
├── layouts/
│   └── MainLayout.tsx       # App shell: sidebar, header, refresh button
├── pages/main/
│   ├── OverviewPage.tsx     # Dashboard
│   ├── uptime/              # Web monitors, page speed, status pages
│   ├── infrastructure/      # Server, SNMP, syslog, Docker
│   ├── database/            # DB targets, details, query insights
│   ├── investigate/         # ITIL ticketing
│   ├── broadcast/           # Status pages + announcements
│   ├── datacenter/          # Facility management
│   └── admin/               # Users, RBAC, audit, settings
├── components/
│   ├── status/              # Uptime UI widgets
│   ├── rackpoint/           # Rack & device management UI
│   ├── datacenter/          # Data center form
│   └── ui/                  # Shared shadcn-style base components
├── hooks/
│   └── useClock.ts
├── lib/
│   ├── api.ts               # API base URL helper
│   ├── auth.ts              # Auth header helper + session management
│   ├── db.ts                # mysql2 connection pool (server-side only)
│   └── utils.ts             # clsx / cn helpers
└── observability/
    ├── ai/gemini.ts         # AI provider abstraction (OpenAI / Gemini)
    └── self/analyze.ts      # Self-analysis and issue detection
```

---

## 2. Backend API

The API is a single-file **Express 5** server (`src/scripts/api/server.ts`) that exposes all REST endpoints. It runs on port `5145` by default and connects to MySQL via a `mysql2/promise` connection pool.

### Process Start

```
npm run start          → src/scripts/start.ts
                         ├── spawns: tsx src/scripts/api/server.ts        (API)
                         ├── spawns: vite (or vite preview for production) (Frontend)
                         └── spawns: tsx src/scripts/monitoring/portal-monitor.ts
```

`start.ts` manages all three child processes, handles EULA acceptance, and outputs a structured enterprise-style boot banner.

### API Endpoint Groups

| Prefix | Responsibility |
|---|---|
| `/health` | API liveness check |
| `/api/auth/*` | Login, logout, token validation, password reset |
| `/api/users/*` | User CRUD, roles, access requests |
| `/api/monitors/*` | Uptime monitor create/read/update/delete/run |
| `/api/monitor/website` | On-demand website check |
| `/api/monitor/pagespeed` | On-demand Lighthouse check |
| `/api/monitor/ping` | On-demand ICMP ping |
| `/api/monitor/port` | On-demand TCP port check |
| `/api/monitor/ssl` | On-demand SSL certificate check |
| `/api/monitor/docker` | On-demand Docker container check |
| `/api/agents/heartbeat` | BeacynMonitorAgent™ heartbeat receiver |
| `/api/agents/metrics` | BeacynMonitorAgent™ metrics push |
| `/api/agents/health` | BeacynMonitorAgent™ health report |
| `/api/databases/*` | DB target CRUD, detail, table metadata |
| `/api/databases/ingest` | BeacynMonitorAgent™ database metrics ingest (POST) |
| `/api/datacenters/*` | Data center CRUD + continuity map |
| `/api/rackpoint/*` | Racks, devices, CSV bulk import |
| `/api/status-pages/*` | Status page CRUD + public view |
| `/api/status-notifications/*` | Broadcast announcements CRUD |
| `/api/incidents/*` | Incident records |
| `/api/tickets/*` | ITIL tickets (Investigate) |
| `/api/servicenow/*` | ServiceNow integration proxy |
| `/api/observability/summary` | Observability AI analysis summary |
| `/api/audit/*` | Audit log read |
| `/api/settings/*` | Platform settings |
| `/api/snmp/*` | SNMP device CRUD + poll |
| `/api/syslog/*` | Syslog event records |

### Middleware Stack (in order)

```
cors()  →  express.json()  →  route handlers  →  error handler
```

Authentication is enforced per-route via an inline `authHeaders()` check (Bearer token validated against the `sessions` table in MySQL).

---

## 3. Monitor Engine

The probe library (`src/scripts/monitoring/monitor-probe.ts`) implements all monitor-type checks. It runs **inside the API server process** for on-demand checks and is also invoked by the **scheduled polling loop** that fires every 60 seconds.

### Supported Probe Types

| Type | Protocol | Library |
|---|---|---|
| `website` / `api` | HTTP/HTTPS | Node.js `http` module |
| `ping` | ICMP | `ping` npm package |
| `port` | TCP | Node.js `net` module |
| `ssl` | TLS handshake | Node.js `tls` module |
| `pagespeed` | Headless Chrome | `lighthouse` + `chrome-launcher` |
| `docker` | Docker REST API | HTTP socket |
| `game` | UDP/TCP | `gamedig` |
| `grpc` | gRPC health proto | `@grpc/grpc-js` + `@grpc/proto-loader` |
| `websocket` | WS / WSS | `ws` |

### Monitor Result Shape

Every probe returns a `MonitorResult`:

```typescript
{
  kind:       MonitorKind;      // probe type
  ok:         boolean;
  status:     'Up' | 'Down';
  statusCode: number;
  latencyMs:  number;
  message:    string;
  error?:     { code, explanation, raw };
  diagnostics: Record<string, any>;
  checkedAt:  string;           // ISO 8601 UTC
}
```

Error codes are structured (`MON_DNS_LOOKUP_FAILED`, `MON_CONNECTION_REFUSED`, `MON_ICMP_UNAVAILABLE`, etc.) and matched against an **error knowledge base** (`public/error-knowledge-base.json`) to surface human-readable resolution hints in the UI.

---

## 4. Database Layer

### Databases

| Database | Purpose |
|---|---|
| `pulseiq` | Application data: users, monitors, incidents, tickets, status pages, settings, audit log |
| `bsa` | Asset data: data centers, racks, rack devices, SNMP targets, syslog events, database monitor targets |

### Connection

`src/lib/db.ts` creates a single shared `mysql2/promise` pool (connection limit: 10). Environment variables:

```
DB_HOST             (default: localhost)
DB_USER             (default: root)
DB_PASSWORD
DB_NAME             (default: pulseiq)
DB_PORT             (default: 3306)
DB_SSL              (true | false)
DB_SSL_REJECT_UNAUTHORIZED
```

### Key Tables (pulseiq)

| Table | Contents |
|---|---|
| `users` | Accounts, hashed passwords, roles |
| `sessions` | Bearer tokens + expiry |
| `monitors` | All monitor configurations |
| `monitor_results` | Per-check results (status, latency, checkedAt) |
| `incidents` | Downtime events linked to monitors |
| `tickets` | ITIL ticket records |
| `status_pages` | Public status page definitions |
| `status_notifications` | Broadcast announcements |
| `audit_log` | Full platform action history |
| `settings` | Key/value platform config |
| `access_requests` | User access request queue |

### Key Tables (bsa)

| Table | Contents |
|---|---|
| `data_centers` | Facility records |
| `racks` | Rack definitions per data center |
| `rack_devices` | Device positions within racks |
| `snmp_devices` | SNMP polling targets |
| `syslog_events` | Received syslog entries |
| `database_targets` | Monitored DB instances (connection config) |
| `database_monitor_logs` | 59-column flattened DB health + query metrics per ingest cycle |

---

## 5. BeacynMonitorAgent™ (Remote Collector)

The agent is a lightweight process deployed **on the target host**. It periodically collects metrics and pushes them to the Beacyn API over plain HTTPS REST.

```
Target Host
┌───────────────────────────────────────┐
│  BeacynMonitorAgent™                  │
│                                       │
│  ┌────────────┐  ┌──────────────────┐ │
│  │ Infra      │  │ Database         │ │
│  │ collector  │  │ collector        │ │
│  │ CPU/mem    │  │ MySQL/PG/Mongo   │ │
│  │ disk/net   │  │ Oracle/MSSQL     │ │
│  │ Docker     │  │ Query metrics    │ │
│  └─────┬──────┘  └────────┬─────────┘ │
└────────┼─────────────────-┼───────────┘
         │  HTTPS REST POST  │
         ▼                   ▼
  POST /api/agents/metrics   POST /api/databases/ingest
  POST /api/agents/heartbeat
  POST /api/agents/health
```

### Agent Push Endpoints

| Endpoint | Payload |
|---|---|
| `POST /api/agents/heartbeat` | Agent alive signal + version |
| `POST /api/agents/metrics` | Infrastructure metrics (CPU, mem, disk, network, Docker) |
| `POST /api/agents/health` | Agent self-health report |
| `POST /api/databases/ingest` | Full flattened DB snapshot (59 fields per engine) |

### Database Ingest Fields (summary)

The `database_monitor_logs` table stores one row per ingest cycle. Key columns include:

```
target_key, engine, db_version, status, collected_at,
health_category, health_reason,
qps, transactions_per_sec, threads_running, threads_connected,
max_connections, connection_errors, deadlocks, full_table_scans,
lock_wait_ms, buffer_cache_hit_pct, cache_hit_ratio_pct,
redo_log_usage_pct, page_faults, bytes_received, bytes_sent,
transactions_waiting,
latency_trend_json, sessions_trend_json, qps_trend_json,
tps_trend_json, connections_trend_json,
payload_json  (full raw agent payload)
```

---

## 6. Observability & AI

```
Observability Engine
┌──────────────────────────────────────────────────┐
│  src/observability/self/analyze.ts               │
│  → reads monitor results, incidents, metrics     │
│  → produces: ObservabilityIssue[]                │
│       (anomaly type, severity, affected entity)  │
│                 │                                │
│  src/observability/ai/gemini.ts                  │
│  → sanitises issues (strips IPs, secrets, IDs)   │
│  → calls: OpenAI GPT-4  OR  Google Gemini        │
│  → returns: summary, recommendations, error      │
└──────────────────────────────────────────────────┘
         ▲
         │ GET /api/observability/summary
         │
   React Observability Page
```

AI is **optional**. If no API key is configured the observability page still shows the raw issue list — the AI summary section is simply hidden.

**Privacy:** All data is redacted before sending to an AI provider. IP addresses, UUIDs, emails, credentials, device IDs, and serial numbers are stripped or masked via regex before any external call.

---

## 7. Portal Security Monitor

`src/scripts/monitoring/portal-monitor.ts` runs as a third child process alongside the API and frontend. It performs:

- Periodic self-checks against the portal's own endpoints
- npm dependency vulnerability scanning (`npm audit`)
- Results are written to the database and surfaced in **Admin → Portal Audit**

---

## 8. CLI Management — beacynctl

`beacynctl` is a Bash CLI installed to `/usr/local/bin/beacynctl` (or `~/.local/bin/beacynctl`) by `deployment/install.sh`.

It communicates with the running platform entirely via the local filesystem and direct service manager calls (launchd / systemd / nohup). It does **not** call the API.

```
beacynctl
├── Service control:  start, stop, restart, status, health, open
├── Logs:             logs [--follow] [--component] [--tail N]
├── Diagnostics:      doctor, self-test, validate, audit
├── Config:           config list|get|set|unset|validate, env …
├── Database ops:     backup, migrate, reset-password
├── Ops:              snapshot, maintenance, cleanup, expose, shell
└── Lifecycle:        version, uninstall
```

See [portal-user-guide.md § 11](portal-user-guide.md#11-troubleshooting-with-beacynctl) for the full command reference.

---

## 9. Deployment Topology

### Minimum (single host)

```
┌─────────────── Single Server ───────────────────┐
│  Beacyn app (npm run start)                     │
│    └─ Express API   :5145                       │
│    └─ Vite frontend :7145                       │
│    └─ Portal monitor                            │
│  MySQL 8  :3306                                 │
│  (Optional) NGINX reverse proxy  :80 / :443     │
└─────────────────────────────────────────────────┘
```

### With Remote Agents

```
┌──────────────────┐      ┌──────────────────┐      ┌──────────────────┐
│  Beacyn Host     │      │  App Server 1    │      │  DB Server       │
│  (control plane) │◄─────│  + Agent         │      │  MySQL/PG/Mongo  │
│  Express + Vite  │      │  metrics push    │      │  + Agent         │
│  MySQL           │◄─────┤                  │◄─────│  db ingest push  │
└──────────────────┘      └──────────────────┘      └──────────────────┘
         ▲
   NGINX / Cloudflare Tunnel / Zero Trust
         ▲
   End Users / Browsers
```

### Container (Docker / Podman)

```
docker-compose.yml
├── beacyn          (app container — Vite + Express + portal monitor)
├── mysql           (MySQL 8 container)
└── nginx           (reverse proxy — optional)
```

See [docker.md](docker.md) and [podman.md](podman.md) for container-specific setup.

---

## 10. External Integrations

| Integration | Direction | Protocol |
|---|---|---|
| ServiceNow | Bidirectional | REST (table API) |
| OpenAI GPT-4 | Outbound (observability AI) | HTTPS REST |
| Google Gemini | Outbound (observability AI) | HTTPS REST |
| Cloudflare Tunnel | Inbound proxy | HTTPS / Cloudflared |
| NGINX | Inbound reverse proxy | HTTP/HTTPS |
| GlobalPing (Uptime) | Outbound probes | HTTPS |

---

## 11. Tech Stack Summary

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite 8, Tailwind CSS v4, Radix UI, Recharts |
| Backend | Node.js 20+, Express 5, TypeScript, tsx runtime |
| Database | MySQL 8 (`mysql2/promise` pool) |
| Monitor probes | http, net, tls, ping, lighthouse, gamedig, grpc-js, ws |
| AI | OpenAI API / Google Gemini API (optional) |
| CLI | Bash (`beacynctl`) — launchd / systemd / nohup |
| Containers | Docker Compose, Podman Compose |
| Reverse proxy | NGINX |
| CI/Build | tsc + vite build (`npm run build`) |
