# Uptime Monitors

Uptime monitoring is the core of Beacyn. Each monitor represents a single check target. The monitoring engine probes every active monitor on a **60-second cycle** (first run happens 5 seconds after the server starts). Results are stored per-check and rolled up into availability percentages, response-time trends, and incident records.

---

## Table of Contents

- [How the Engine Works](#how-the-engine-works)
- [Check Intervals and Timing](#check-intervals-and-timing)
- [HTTP / Website Monitors](#http--website-monitors)
- [API Endpoint Monitors](#api-endpoint-monitors)
- [Ping Monitors](#ping-monitors)
- [Port Monitors](#port-monitors)
- [SSL/TLS Monitors](#ssltls-monitors)
- [Docker Monitors](#docker-monitors)
- [Page Speed Monitors](#page-speed-monitors)
- [WebSocket Monitors](#websocket-monitors)
- [gRPC Monitors](#grpc-monitors)
- [Game Server Monitors](#game-server-monitors)
- [Bulk Monitor Import](#bulk-monitor-import)
- [Diagnostics and Error Codes](#diagnostics-and-error-codes)
- [Uptime Calculation](#uptime-calculation)
- [On-Demand Probes](#on-demand-probes)

---

## How the Engine Works

Every monitor has a `parent_type`, an optional `sub_type`, and a `target_endpoint`. When a probe cycle runs, the engine calls `detectMonitorKind()` which inspects these three fields to decide which probe function to use:

| Priority | Detection rule |
|---|---|
| 1 | `parent_type` or `sub_type` contains `game` → game probe |
| 2 | `parent_type` or `sub_type` contains `grpc`, or endpoint starts with `grpc://` → gRPC probe |
| 3 | `parent_type` or `sub_type` contains `websocket`, or endpoint starts with `ws://` / `wss://` → WebSocket probe |
| 4 | `parent_type` is `api` → website probe (kind reported as `api`) |
| 5 | `parent_type` contains `website` or `http` → website probe |
| 6 | `parent_type` contains `docker` → Docker probe |
| 7 | `parent_type` contains `network port` or `port` → port probe |
| 8 | `parent_type` contains `ping`, `server`, `device`, `switch`, `appliance`, or `storage` → ping probe |
| 9 | Endpoint starts with `http://` or `https://` → website probe |
| 10 | No match → website probe (fallback, kind logged as `unknown`) |

Every probe returns a `MonitorResult` with:

```ts
{
  kind:        MonitorKind,   // website | api | ping | port | docker | ssl | pagespeed | game | grpc | websocket
  ok:          boolean,       // overall pass/fail
  status:      'Up' | 'Down',
  statusCode:  number,        // HTTP status code or 0 for non-HTTP probes
  latencyMs:   number,        // end-to-end probe round-trip time
  message:     string,        // human-readable summary
  error?:      MonitorError,  // error code + explanation (only on failure)
  diagnostics: object,        // probe-specific enrichment data
  checkedAt:   string         // ISO 8601 timestamp
}
```

---

## Check Intervals and Timing

| Parameter | Value |
|---|---|
| **Global probe cycle** | Every **60 seconds** |
| **Startup delay** | First cycle runs **5 seconds** after server boot |
| **Probe timeout** | Varies by type (see each section below) |
| **SNMP poll interval** | Configurable per device (minimum 30 s, default 60 s) |
| **Agent heartbeat sync** | Every **30 seconds** |

All monitors in the system are probed in the same cycle. There is no per-monitor configurable interval — all monitors share the global 60-second cadence. If a monitor is `PAUSED` it is skipped entirely in the cycle.

> **Note:** Pagespeed monitors (Lighthouse) are intentionally slower per-run due to headless Chrome startup time. They are still executed in the same cycle but their latency reading reflects the full audit duration.

---

## HTTP / Website Monitors

**`parent_type`**: `website`  
**Probe function**: `monitorWebsiteTarget()`

Website monitors perform a live HTTP `GET` request to the target URL and determine availability based on the HTTP response code.

### How it works

1. If the endpoint includes `https://` or `http://`, that URL is used directly.
2. If no scheme is present, Beacyn first tries `https://` and falls back to `http://` only if the HTTPS attempt fails.
3. A successful response (HTTP **200–399**) marks the monitor as **Up**.
4. HTTP 4xx or 5xx responses mark the monitor as **Down**.
5. If the request fails entirely (no response), Beacyn automatically runs secondary diagnostics:
   - **ICMP ping** to the host
   - **TCP port check** on the target port
   - **TLS certificate check** (for HTTPS targets)
   - Reports a `probableCause` field explaining the likely failure layer

### Configuration

| Field | Description | Example |
|---|---|---|
| **Name** | Display label | `My Website` |
| **Target endpoint** | Full URL or bare hostname | `https://example.com` or `example.com` |
| **parent_type** | Set to `website` | `website` |

### Probe details

| Detail | Value |
|---|---|
| Method | `GET` |
| User-Agent | `PulseIQ-Monitor/2.0` |
| Timeout | **10 seconds** |
| Success criteria | Status code 200–399 |
| Redirect handling | Followed automatically |

### Diagnostics on failure

When a website monitor goes **Down**, the result includes a `diagnostics` object with:

```json
{
  "attempts": [...],
  "host": "example.com",
  "tcpPort": 443,
  "reachability": { "ok": true, "packetLossPct": 0, "latencyMs": 12 },
  "tcpProbe": { "ok": true, "message": "TCP 443 open" },
  "tlsProbe": { "ok": false, "errorCode": "MON_TLS_HANDSHAKE_FAILED" },
  "probableCause": "Application/service layer failure despite host reachability."
}
```

This lets you immediately understand whether the problem is a network issue, a port block, a TLS failure, or an application failure — without having to investigate manually.

---

## API Endpoint Monitors

**`parent_type`**: `api`  
**Probe function**: `monitorWebsiteTarget()` (same as website, reported as kind `api`)

API monitors behave identically to website monitors under the hood, but are semantically categorised as API checks. Use this type when monitoring:

- REST endpoints (`GET /health`, `GET /status`)
- GraphQL endpoints
- Any HTTP-based service that is not a public-facing website

The same redirect-follow, 10-second timeout, and 200–399 success rule apply. The `kind` field in the result is reported as `api` rather than `website`, allowing you to filter and separate API checks from web checks in the dashboard.

### Example targets

```
https://api.example.com/health
https://api.example.com/v2/status
http://internal-service:8080/ping
```

---

## Ping Monitors

**`parent_type`**: `ping`, `server`, `device`, `switch`, `appliance`, or `storage`  
**Probe function**: `monitorPingTarget()`

Ping monitors send **ICMP echo requests** to a host and measure round-trip time and packet loss.

### How it works

1. Sends **4 ICMP packets** with a 3-second timeout.
2. Reports average RTT, min/max/stddev, packet loss %, and the resolved IP.
3. The host is marked **Up** if at least one packet returns.

### ICMP fallback (containerised / managed environments)

Some hosting platforms (Docker, cloud VMs, managed PaaS) block raw ICMP sockets. When Beacyn detects this (`MON_ICMP_UNAVAILABLE`), it automatically falls back to **TCP reachability checks**:

1. DNS lookup is attempted first to confirm the host resolves.
2. TCP connection attempt on **port 443**.
3. If port 443 fails, attempt on **port 80**.
4. If any TCP check succeeds, the host is reported **Up** with `ICMP unavailable; TCP fallback succeeded` noted in the message.
5. If all fallbacks fail, the host is reported **Down** with the complete failure chain in diagnostics.

### Configuration

| Field | Description | Example |
|---|---|---|
| **Target endpoint** | Hostname or IP address | `192.168.1.1` or `router.local` |
| **parent_type** | Any of the matched types | `ping` |

### Diagnostics

```json
{
  "host": "192.168.1.1",
  "resolvedIp": "192.168.1.1",
  "packetLossPct": 0,
  "minMs": 1,
  "maxMs": 4,
  "stddevMs": 0.5
}
```

---

## Port Monitors

**`parent_type`**: `network port` or `port`  
**Probe function**: `monitorPortTarget()`

Port monitors attempt a **TCP socket connection** to a specific host and port. The port is reported **Up** if the TCP handshake completes, and **Down** if the connection is refused, filtered, or times out.

### Use cases

- Checking that a database port is open (MySQL 3306, PostgreSQL 5432)
- Monitoring non-HTTP services (SMTP 25/587, SSH 22, RDP 3389)
- Verifying firewall rules
- Any service that does not have an HTTP or ICMP-based check

### Configuration

| Field | Description | Example |
|---|---|---|
| **Target endpoint** | `host:port` format | `db.internal:3306` |
| **parent_type** | `network port` | `network port` |

### Probe details

| Detail | Value |
|---|---|
| Protocol | TCP |
| Timeout | **5 seconds** |
| Success criteria | TCP handshake completes |

### Diagnostics

```json
{
  "host": "db.internal",
  "port": 3306
}
```

---

## SSL/TLS Monitors

**`parent_type`**: `ssl` (or detected automatically when `monitorWebsiteTarget` runs a TLS sub-probe)  
**Probe function**: `monitorSSLTarget()`

SSL monitors perform a **TLS handshake** with the target and extract full certificate metadata. They do not issue HTTP requests — the check is purely at the TLS layer.

### What gets checked

- Whether the TLS handshake completes successfully
- Whether the server presents a certificate at all
- Certificate **issuer** (organization and/or CN)
- Certificate **subject** (CN / domain)
- Certificate **validity window** (`valid_from`, `valid_to`)
- **Days remaining** until expiry
- Whether the certificate is **expired**
- Whether the certificate is **CA-authorized** (chain trusted)

> **Note:** Beacyn uses `rejectUnauthorized: false` in the TLS connection options. This means self-signed certificates will not cause the handshake to fail outright — the cert data is still collected and the `isAuthorized` field will be `false` to indicate the chain is not CA-trusted.

### Configuration

| Field | Description | Example |
|---|---|---|
| **Target endpoint** | Hostname or `host:port` | `example.com` or `example.com:8443` |
| **port** | Default `443` | `443` |
| **parent_type** | `ssl` | `ssl` |

### Probe details

| Detail | Value |
|---|---|
| Protocol | TLS (any version negotiated by target) |
| Timeout | **5 seconds** |
| Port default | 443 |
| Success criteria | Handshake completes AND a certificate is presented |

### Diagnostics

```json
{
  "host": "example.com",
  "port": 443,
  "issuer": "Let's Encrypt",
  "subject": "example.com",
  "validFrom": "2025-01-01T00:00:00.000Z",
  "validTo": "2025-04-01T00:00:00.000Z",
  "daysRemaining": 42,
  "isExpired": false,
  "isAuthorized": true
}
```

### Alert on expiry

When the `daysRemaining` value drops below a configured threshold (e.g., 30 days), the monitor transitions to **Down** and an Investigate ticket is created automatically.

---

## Docker Monitors

**`parent_type`**: `docker`  
**Probe function**: `monitorDockerTarget()`

Docker monitors connect to the **Docker daemon** and check either the overall daemon health or the running state of a specific container.

### Connection modes

#### Unix socket (default, same host)

```
/var/run/docker.sock
```

The monitor connects to the Docker socket on the same machine running Beacyn. The daemon must grant the Beacyn process socket access.

#### Remote TCP (Docker daemon on another host)

```
tcp://192.168.1.50:2375
```

Connects to a remote Docker daemon over TCP. Use `tcp://host:2376` with TLS where possible.

#### Specific container monitoring

Append the container ID or name to the TCP path:

```
tcp://192.168.1.50:2375/my-container-name
```

Or supply just the container name/ID when using the socket (set as `target_endpoint`).

### What gets checked

**Daemon-level** (no container ID in endpoint):
- Queries `GET /containers/json?all=true` via the Docker HTTP API.
- Reports total containers, running containers, and stopped containers.
- Daemon is **Up** if the API responds with HTTP 200.

**Container-level** (container ID or name provided):
- Searches the container list for a matching ID prefix or name.
- Container is **Up** if its `State` is `running`.
- Container is **Down** if its `State` is anything else (`exited`, `paused`, `dead`, etc.) or if it is not found.

### Configuration examples

| Scenario | target_endpoint |
|---|---|
| Local Docker daemon | `/var/run/docker.sock` |
| Remote Docker daemon | `tcp://10.0.0.5:2375` |
| Specific container by name | `tcp://10.0.0.5:2375/nginx-proxy` |

### Diagnostics (daemon-level)

```json
{
  "connectionRef": "/var/run/docker.sock",
  "totalContainers": 12,
  "runningContainers": 11,
  "stoppedContainers": 1,
  "sample": [
    { "id": "a1b2c3d4e5f6", "names": ["/nginx"], "image": "nginx:latest", "state": "running" }
  ]
}
```

### Diagnostics (container-level)

```json
{
  "connectionRef": "tcp://10.0.0.5:2375",
  "targetContainerId": "nginx-proxy",
  "containerStats": {
    "id": "a1b2c3d4e5f6",
    "names": ["/nginx-proxy"],
    "image": "nginx:1.25",
    "state": "running",
    "status": "Up 3 days"
  }
}
```

---

## Page Speed Monitors

**`parent_type`**: `pagespeed`  
**Probe function**: `monitorPageSpeedTarget()`

Page speed monitors run a full **Google Lighthouse** audit against the target URL using a headless Chrome browser. If the local Chrome instance is unavailable, the probe falls back to the **Google PageSpeed Insights API** automatically.

### Lighthouse categories

| Category | Description |
|---|---|
| **Performance** | Core Web Vitals and rendering metrics — the primary score |
| **Accessibility** | WCAG compliance, ARIA usage, contrast |
| **Best Practices** | HTTPS, HTTP/2, known security issues |
| **SEO** | Meta tags, robots.txt, crawlability |

### Core performance metrics

| Metric | Abbreviation | What it measures |
|---|---|---|
| First Contentful Paint | FCP | Time until first text/image is visible |
| Largest Contentful Paint | LCP | Time until the largest visible element loads |
| Total Blocking Time | TBT | Time the main thread is blocked from responding |
| Cumulative Layout Shift | CLS | Visual stability — measures unexpected layout jumps |
| Speed Index | SI | How quickly the page content is visually populated |
| Time to Interactive | TTI | Time until the page is fully interactive |
| Server Response Time | TTFB | Time to first byte from the server |

### Score bands

| Score | Band | Colour |
|---|---|---|
| 90–100 | Good | Green |
| 50–89 | Needs Improvement | Orange |
| 0–49 | Poor | Red |

### Strategies

| Strategy | Device emulation |
|---|---|
| `desktop` (default) | 1350×940 viewport, no device scaling |
| `mobile` | Mobile device emulation, slower CPU/network throttling |

Set the strategy in the monitor's sub_type or configuration.

### Chrome launch flags

```
--headless=new
--no-sandbox
--disable-dev-shm-usage
--disable-gpu
```

These flags make Lighthouse work reliably in Docker and other containerised environments.

### Fallback to Google PageSpeed API

If Chrome fails to launch (e.g., not installed), the probe automatically calls:

```
GET https://www.googleapis.com/pagespeedonline/v5/runPagespeed
  ?url=<url>
  &strategy=<desktop|mobile>
```

The fallback returns the same metric structure with an additional `loadingExperience` field containing real-world Chrome UX data.

### Full diagnostics shape

```json
{
  "strategy": "desktop",
  "requestedUrl": "https://example.com",
  "finalUrl": "https://example.com/",
  "categories": {
    "performance": 87,
    "accessibility": 94,
    "bestPractices": 100,
    "seo": 91,
    "pwa": 0
  },
  "metrics": {
    "firstContentfulPaint": "0.8 s",
    "largestContentfulPaint": "1.4 s",
    "speedIndex": "1.2 s",
    "totalBlockingTime": "40 ms",
    "cumulativeLayoutShift": "0.002",
    "timeToInteractive": "1.5 s",
    "serverResponseTime": "120 ms"
  },
  "insights": [...],
  "passedAudits": [...],
  "screenshot": "<base64 PNG>"
}
```

---

## WebSocket Monitors

**`parent_type`**: `websocket`, or endpoint starts with `ws://` or `wss://`  
**Probe function**: `monitorWebSocketTarget()`

WebSocket monitors attempt to **open a WebSocket connection** to the target. The check passes as soon as the connection is established (`open` event fires). The connection is immediately closed — no messages are sent.

### How it works

1. If the endpoint starts with `ws://` or `wss://`, it is used as-is.
2. If no scheme is present, `wss://` is prepended automatically.
3. The probe sets a **5-second handshake timeout**.
4. `open` event = **Up**.
5. `error` event = **Down**.

### Use cases

- Monitoring real-time application backends (chat, notifications, live dashboards)
- Checking WebSocket gateway availability
- Verifying that Socket.IO or similar upgrading endpoints are reachable

### Configuration

| Field | Description | Example |
|---|---|---|
| **Target endpoint** | WebSocket URL | `wss://ws.example.com/socket` |
| **parent_type** | `websocket` | `websocket` |

### Probe details

| Detail | Value |
|---|---|
| Protocol | WebSocket (RFC 6455) |
| Handshake timeout | **5 seconds** |
| Success criteria | `open` event received |
| Success status code | `101` (Switching Protocols) |

---

## gRPC Monitors

**`parent_type`**: `grpc`, or endpoint starts with `grpc://`  
**Probe function**: `monitorGrpcTarget()`

gRPC monitors implement the **standard gRPC Health Checking Protocol** (`grpc.health.v1.Health/Check`). This is the industry-standard way to probe gRPC services — most gRPC frameworks support it natively.

### How it works

1. Loads the `health.proto` definition from `src/scripts/monitoring/health.proto`.
2. Connects to the target using **insecure credentials** (no mTLS).
3. Calls `Health.Check({ service: '' })` — a check against the root service.
4. Response `status === 'SERVING'` = **Up**.
5. Any other status (`NOT_SERVING`, `UNKNOWN`) or gRPC error = **Down**.
6. A **5-second internal timeout** is applied.

### Configuration

| Field | Description | Example |
|---|---|---|
| **Target endpoint** | Host:port or grpc:// URL | `grpc://grpc.example.com:50051` or `grpc.example.com:50051` |
| **parent_type** | `grpc` | `grpc` |

> The `grpc://` scheme prefix is stripped before connecting. It is accepted purely as a signal to the monitor kind detector.

### gRPC service implementation requirement

The target service must implement `grpc.health.v1.Health`. In most frameworks:

- **Go**: `google.golang.org/grpc/health`
- **Java**: `io.grpc:grpc-services`
- **Node.js**: `@grpc/grpc-js` with health proto
- **Python**: `grpcio-health-checking`

### Diagnostics

```json
{
  "endpoint": "grpc.example.com:50051",
  "grpcStatus": "SERVING"
}
```

---

## Game Server Monitors

**`parent_type`**: `game` or `sub_type` contains a game name  
**Probe function**: `monitorGameTarget()` via [GameDig](https://github.com/gamedig/node-gamedig)

Game server monitors query game servers using their native **game query protocols**. This is significantly different from a simple ping — it retrieves live server state including player count, server name, current map, and maximum capacity.

### How it works

1. Parses `host:port` from the endpoint (defaults to port **25565** if no port is specified).
2. Calls `GameDig.query()` with the detected game type and a `maxRetries: 1` setting.
3. Success: server responds with state data → **Up**, player count reported.
4. Failure: no response or connection refused → **Down**.

### Supported game types (built-in mapping)

| sub_type value | GameDig type used |
|---|---|
| `minecraft` | `minecraft` |
| `source engine` | `csgo` |
| `unreal` | `unreal2` |
| `rust` | `rust` |
| `valheim` | `valheim` |
| *(any other)* | `minecraft` (fallback) |

GameDig supports hundreds of additional game protocols. Contact your administrator to add custom game type mappings.

### Configuration

| Field | Description | Example |
|---|---|---|
| **Target endpoint** | `host:port` | `mc.example.com:25565` |
| **parent_type** | `game` | `game` |
| **sub_type** | Game protocol hint | `minecraft`, `rust`, `valheim` |

### Diagnostics

```json
{
  "host": "mc.example.com",
  "port": 25565,
  "gameType": "minecraft",
  "name": "My Minecraft Server",
  "map": "world",
  "password": false,
  "numPlayers": 7,
  "maxPlayers": 20
}
```

---

## Bulk Monitor Import

Beacyn does not provide a dedicated UI for bulk monitor CSV import, but monitors can be created in bulk via the REST API. This is the recommended approach for large-scale deployments or migrations from other monitoring tools.

### API-based bulk creation

Use the `POST /api/assets` endpoint in a loop or script:

```bash
#!/bin/bash
TOKEN="your-session-token"
BASE="http://localhost:5145"

# Array of monitors to create
declare -a MONITORS=(
  '{"name":"Website A","parent_type":"website","target_endpoint":"https://a.example.com","device_category":"uptime","status":"ACTIVE"}'
  '{"name":"Website B","parent_type":"website","target_endpoint":"https://b.example.com","device_category":"uptime","status":"ACTIVE"}'
  '{"name":"API Health","parent_type":"api","target_endpoint":"https://api.example.com/health","device_category":"uptime","status":"ACTIVE"}'
  '{"name":"DB Port","parent_type":"network port","target_endpoint":"db.internal:5432","device_category":"uptime","status":"ACTIVE"}'
)

for MONITOR in "${MONITORS[@]}"; do
  RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/assets" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "$MONITOR")
  echo "$RESPONSE - $MONITOR"
done
```

### Monitor object reference

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | Yes | Display name shown in the dashboard |
| `parent_type` | string | Yes | Determines probe type — see [How the Engine Works](#how-the-engine-works) |
| `sub_type` | string | No | Additional hint (e.g., game type, strategy) |
| `target_endpoint` | string | Yes | URL, host, host:port, or socket path |
| `device_category` | string | Yes | Set to `uptime` for all uptime monitors |
| `status` | string | No | `ACTIVE` (default) or `PAUSED` |

### Example import payload values by type

| Monitor Type | parent_type | target_endpoint example |
|---|---|---|
| Website | `website` | `https://example.com` |
| API Endpoint | `api` | `https://api.example.com/health` |
| Ping | `ping` | `192.168.1.1` |
| Port | `network port` | `db.internal:5432` |
| SSL | `ssl` | `example.com` |
| Docker daemon | `docker` | `/var/run/docker.sock` |
| Docker container | `docker` | `tcp://host:2375/container-name` |
| Page Speed | `pagespeed` | `https://example.com` |
| WebSocket | `websocket` | `wss://ws.example.com/socket` |
| gRPC | `grpc` | `grpc.example.com:50051` |
| Game (Minecraft) | `game` | `mc.example.com:25565` |

---

## Diagnostics and Error Codes

When a monitor fails, the `error` field contains a structured code and explanation.

| Error Code | Meaning |
|---|---|
| `MON_ICMP_UNAVAILABLE` | ICMP ping blocked by runtime environment (common in containers). TCP fallback was attempted. |
| `MON_DNS_LOOKUP_FAILED` | Hostname does not resolve from the monitor host. Check DNS or use an IP address. |
| `MON_CONNECTION_REFUSED` | Host is reachable but the service is not listening on the target port. |
| `MON_NETWORK_UNREACHABLE` | No network route to the target from the monitor host. Check routing/firewall. |
| `MON_TIMEOUT` | Connection timed out. Possible causes: firewall dropping packets, overloaded target, wrong port. |
| `MON_TLS_HANDSHAKE_FAILED` | TLS negotiation failed. Possible causes: expired cert, protocol mismatch, SNI mismatch. |
| `MON_TLS_NO_CERT` | Target did not present any certificate during the TLS handshake. |
| `MON_HTTP_5XX` | Target responded with a 5xx server error. |
| `MON_HTTP_4XX` | Target responded with a 4xx client/protection error (includes 403, 429, 404). |
| `MON_DOCKER_DAEMON_ERROR` | Docker daemon API returned a non-200 response. |
| `MON_DOCKER_CONTAINER_MISSING` | Named container does not exist on the daemon. |
| `MON_DOCKER_PARSE_ERROR` | Docker daemon response could not be parsed as JSON. |
| `MON_GRPC_ERROR` | gRPC call failed with an application-level error. |
| `MON_GRPC_INTERNAL` | Internal gRPC probe setup failure (e.g., proto file missing). |
| `MON_WS_ERROR` | WebSocket connection or configuration error. |
| `MON_CONFIG_MISSING_ENDPOINT` | No `target_endpoint` is configured for the monitor. |
| `MON_UNKNOWN_ERROR` | Unclassified failure. Inspect the `raw` field for the original error message. |

---

## Uptime Calculation

Uptime percentage is calculated as:

$$\text{Uptime \%} = \frac{\text{up\_checks}}{\text{total\_checks}} \times 100$$

- Checks are stored per-probe in hourly buckets.
- The default display window is **90 days**.
- **Paused** periods are excluded from both the numerator and denominator — pausing a monitor does not count as downtime.
- A transition from **Up → Down** opens an incident record. The incident closes when the monitor returns to **Up**.
- Incident duration is stored and visible in the Service Details Sheet.

---

## On-Demand Probes

Any monitor type can be run immediately outside the 60-second cycle using the on-demand probe endpoints. These return the same `MonitorResult` structure but do not store the result or affect uptime statistics.

| Endpoint | Query parameters |
|---|---|
| `GET /api/monitor/website` | `?url=<url>` |
| `GET /api/monitor/pagespeed` | `?url=<url>&strategy=desktop\|mobile` |
| `GET /api/monitor/docker` | `?socketPath=<path>` (default `/var/run/docker.sock`) |
| `GET /api/monitor/ping` | `?host=<host>` |
| `GET /api/monitor/ssl` | `?host=<host>&port=<port>` |
| `GET /api/monitor/port` | `?host=<host>&port=<port>` |

These endpoints require a valid Bearer token. Use them from the **Service Details Sheet** ("Run Now" button) or directly via the API.

```bash
# On-demand SSL check
curl "http://localhost:5145/api/monitor/ssl?host=example.com&port=443" \
  -H "Authorization: Bearer $TOKEN" | jq .
```

> WebSocket, gRPC, and Game Server monitors do not have dedicated on-demand endpoints. To test them, use `beacynctl self-test` or trigger a full probe cycle via `beacynctl restart`.
