# Deployment & Scripts Guide

## 1. What runs when you execute each command

### `npm run dev`

**Entry point:** `src/scripts/devWithPortalMonitor.ts`

This is a **process manager** script that spawns two child processes simultaneously:

| Child Process | Command | Purpose |
|---|---|---|
| `vite` | `vite` | Vite dev server — serves the React frontend on **http://localhost:7145** with HMR |
| `portal-monitor` | `tsx src/scripts/portalSecurityMonitor.ts` | Background security & portal health monitor |

Both processes share the same terminal output (stdio: 'inherit'). If Vite exits for any reason, the monitor is also killed and the whole dev session ends cleanly (SIGTERM on all children).

#### What `portalSecurityMonitor.ts` does
- Runs a **health check cycle** twice a day (default: `00:00` and `12:00`, configurable via `PORTAL_MONITOR_RUN_TIMES` env var).
- Each cycle it:
  - Pings the frontend (`http://localhost:7145`) and backend (`http://localhost:5145`) for liveness and latency.
  - Checks DB engine, version, space usage and uptime.
  - Runs `npm audit` to collect vulnerability counts.
  - Writes a `portal_runtime_snapshots` record to the database.
  - Publishes structured audit events to `/api/portal/audit` on the backend.
- `PORTAL_MONITOR_RUN_ONCE=false` is forced in dev so it keeps running on schedule.

> **Note:** `npm run dev` does **not** start the Express backend. You need `npm run server` separately.

---

### `npm run server`

**Entry point:** `src/scripts/server.ts`

This is the **Express backend** — a fully standalone Node.js API server. It starts on port **5145**.

What it boots:

| Feature | Detail |
|---|---|
| HTTP API | Express on `http://localhost:5145` |
| Monitoring engine | Runs `runAllChecks()` every **60 seconds** — probes all assets in the DB |
| SNMP Trap listener | UDP listener on port **9162** |
| Syslog UDP listener | UDP on port **5514** |
| Syslog TCP listener | TCP on port **5514** |
| DB schema migrations | Runs `ensureXxx()` helpers on startup to create/alter tables safely |
| ServiceNow integration | Auto-creates incidents for P1/P2 alerts if `SNOW_*` env vars are set |

On startup it logs:
```
PulseIQ Backend running on http://localhost:5145
Monitoring engine started — checking all assets every 60s
SNMP trap UDP listener active on 0.0.0.0:9162
Syslog UDP listener active on 0.0.0.0:5514
Syslog TCP listener active on 0.0.0.0:5514
```

---

## 2. Running everything with a single command

There is currently no single `npm start` that launches all three processes together. Here is how to add one.

### Proposed: `npm start`

The idea is a single launcher script (`src/scripts/start.ts`) that:
1. Starts the **Express backend** (server.ts) as a child process.
2. Starts **Vite** as a child process.
3. Starts **portalSecurityMonitor** as a child process.
4. Prints a clean startup banner showing App version, disclaimer, local URL, and network URL.

Example startup output:

```
╔══════════════════════════════════════════════╗
║         Beacyn / PulseIQ  v2.0.1             ║
║  For internal use only. Authorised users only║
╚══════════════════════════════════════════════╝

  ➜  Backend    http://localhost:5145
  ➜  Frontend   http://localhost:7145
  ➜  Network    http://192.168.x.x:7145

  SNMP Trap  UDP :9162
  Syslog     UDP/TCP :5514

Press Ctrl+C to stop all services.
```

In `package.json`:
```json
"scripts": {
  "start": "tsx src/scripts/start.ts"
}
```

---

## 3. Exposing the app to the internal network or public internet

When running locally you have three realistic options depending on your need:

---

### Option A — Internal Network Only (LAN / VPN)

The simplest option. No extra software needed.

1. In `vite.config.ts`, add `host: '0.0.0.0'` to bind to all interfaces:
   ```ts
   server: {
     host: '0.0.0.0',
     port: 7145,
   }
   ```
2. Do the same for the Express server in `server.ts`:
   ```ts
   app.listen(PORT, '0.0.0.0', () => { ... })
   ```
3. Anyone on the same LAN or VPN can now reach:
   - Frontend: `http://<your-machine-ip>:7145`
   - Backend API: `http://<your-machine-ip>:5145`

> Use `ifconfig` / `ipconfig` to find your machine IP. Firewall rules may need to allow ports 7145 and 5145.

---

### Option B — NGINX Reverse Proxy (production-style, LAN or VPN)

NGINX sits in front of Vite + Express, exposing a **single port (80 or 443)** to the outside and routing requests internally.

```
Client browser
      │
      ▼
NGINX :80/:443
  ├── /api/*  →  proxy_pass http://127.0.0.1:5145
  └── /*      →  proxy_pass http://127.0.0.1:7145
```

Minimal NGINX site config (`/etc/nginx/sites-available/beacyn`):

```nginx
server {
    listen 80;
    server_name app.yourdomain.internal;   # or your server IP

    # All API requests go to the Express backend
    location /api/ {
        proxy_pass         http://127.0.0.1:5145;
        proxy_http_version 1.1;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # Everything else goes to Vite / built frontend
    location / {
        proxy_pass         http://127.0.0.1:7145;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection "upgrade";   # needed for Vite HMR WebSocket
        proxy_set_header   Host $host;
    }
}
```

For **HTTPS** use Certbot (Let's Encrypt) or supply your own cert:
```bash
sudo certbot --nginx -d app.yourdomain.com
```

> With NGINX in place, your users only ever see one address, e.g. `https://app.yourdomain.com` — no ports to remember.

---

### Option C — Cloudflare Tunnel (public internet, zero open ports)

Cloudflare Tunnel lets you expose a local app to the public internet **without opening any firewall ports or needing a static IP**. Traffic flows:

```
Public internet user
       │
       ▼
Cloudflare edge (HTTPS)
       │
  Cloudflare Tunnel (encrypted outbound from your machine)
       │
       ▼
cloudflared daemon on your machine
  ├── app.yourdomain.com  →  http://localhost:7145  (frontend)
  └── api.yourdomain.com  →  http://localhost:5145  (backend)
```

#### Setup steps

1. **Install cloudflared:**
   ```bash
   # macOS
   brew install cloudflared

   # Linux
   curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o cloudflared
   chmod +x cloudflared && sudo mv cloudflared /usr/local/bin/
   ```

2. **Login and link to your Cloudflare account:**
   ```bash
   cloudflared tunnel login
   ```

3. **Create a named tunnel:**
   ```bash
   cloudflared tunnel create beacyn-app
   ```

4. **Create tunnel config** (`~/.cloudflared/config.yml`):
   ```yaml
   tunnel: beacyn-app
   credentials-file: ~/.cloudflared/<tunnel-id>.json

   ingress:
     - hostname: app.yourdomain.com
       service: http://localhost:7145
     - hostname: api.yourdomain.com
       service: http://localhost:5145
     - service: http_status:404
   ```

5. **Add DNS routes** (Cloudflare manages these automatically):
   ```bash
   cloudflared tunnel route dns beacyn-app app.yourdomain.com
   cloudflared tunnel route dns beacyn-app api.yourdomain.com
   ```

6. **Run the tunnel:**
   ```bash
   cloudflared tunnel run beacyn-app
   ```

7. **To run as a system service** (starts on boot):
   ```bash
   sudo cloudflared service install
   sudo systemctl start cloudflared
   ```

> Cloudflare Tunnel gives you free HTTPS, DDoS protection, and access controls (Cloudflare Access) with zero inbound firewall rules.

---

## 4. Comparison table

| Method | Audience | HTTPS | Open ports | Complexity |
|---|---|---|---|---|
| Direct bind (`0.0.0.0`) | LAN / VPN | No | 7145, 5145 | Minimal |
| NGINX reverse proxy | LAN / VPN / Public | Yes (with cert) | 80, 443 | Low |
| Cloudflare Tunnel | Public internet | Yes (automatic) | None | Low |

---

## 5. Recommended `npm start` setup (summary)

```
npm start
└── src/scripts/start.ts
    ├── spawn: tsx src/scripts/server.ts          → backend :5145
    ├── spawn: vite                                → frontend :7145
    └── spawn: tsx src/scripts/portalSecurityMonitor.ts  → health monitor
```

All three processes share one terminal, all die together on Ctrl+C, and a banner is printed at boot showing version, URLs, and network address.
