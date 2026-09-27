# How to run Beacyn

Local reference for starting the project. The app is three processes plus MySQL:

| Process | What it is | Default address |
|---|---|---|
| Frontend | Vite (React) | http://localhost:7145 |
| Backend API | Express in `src/scripts/api/server.ts` | http://localhost:5145 |
| Portal monitor | Scheduled health and audit checks | no port |
| MySQL | Application database `pulseiq` | `127.0.0.1:3306` |

The API also opens optional listeners when those features are enabled:

| Listener | Default |
|---|---|
| SNMP traps (UDP) | `0.0.0.0:9162` |
| Syslog (UDP and TCP) | `0.0.0.0:5514` |

The API port is fixed at **5145** in `src/scripts/api/server.ts`. The `PORT` value in `.env` only changes the banner printed by `npm run start`. It does not move the API.

Checks of every monitor run every 60 seconds. Agent online/offline sync runs every 30 seconds. The portal monitor runs on a daily schedule (default `00:00` and `12:00`) unless `PORTAL_MONITOR_RUN_ONCE=true`.

## Prerequisites

- Node.js 20+
- npm 10+
- MySQL 8, reachable with the credentials in `.env`

## First-time setup

From the repository root:

```bash
npm ci
cp .env.example .env
```

Edit `.env`. The values the app actually reads for local development:

```env
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your-password
DB_NAME=pulseiq
DB_SSL=false

VITE_API_BASE_URL=http://localhost:5145
PULSE_API_BASE_URL=http://localhost:5145
VITE_APP_URL=http://localhost:7145
```

Create the schema:

```bash
npm run initdb
```

`npm run initdb` runs `db/initDb.ts`. It creates and updates tables in `DB_NAME` (default `pulseiq`). The API also applies small column updates on its own startup, so a restart of `npm run server` picks up schema helpers that `initdb` already applied.

Sign-in uses the seeded super-admin from [rbac.md](rbac.md) (`root@beacyn.com`).

## Startup script

Yes. The full launcher is `src/scripts/start.ts`, invoked by:

```bash
npm run start
```

That is the command to use when you want the whole platform in one terminal. It starts, in order:

1. Backend API (`tsx src/scripts/api/server.ts`)
2. Frontend (`vite`, or `vite preview --host` when `NODE_ENV=production`)
3. Portal monitor (`tsx src/scripts/monitoring/portal-monitor.ts`)

`Ctrl+C` stops all three.

The first run asks you to accept the EULA. Acceptance is saved in `.eula-accepted` at the repo root. Later runs skip the prompt. To accept without a prompt (CI, Docker, or a non-interactive shell):

```bash
EULA_ACCEPTED=true npm run start
```

Without a TTY and without `EULA_ACCEPTED=true`, `npm run start` exits instead of starting services.

`npm run start` hides routine noise (per-check Up/Down lines, Vite HMR updates, and `EADDRINUSE` when SNMP or syslog is already bound). Use the split commands below when you need those logs.

## npm scripts

| Command | Starts | Does not start |
|---|---|---|
| `npm run start` | API, Vite, portal monitor | — |
| `npm run dev` | Vite and portal monitor | **API** |
| `npm run dev:frontend` | Vite only | API, portal monitor |
| `npm run server` | API only | Vite, portal monitor |
| `npm run monitor:portal` | Portal monitor only | API, Vite |
| `npm run initdb` | Database setup, then exits | the app |
| `npm run build` | Typecheck and production frontend build | the app |
| `npm run preview` | Built frontend on port 7145 | API |
| `npm run lint` | ESLint, then exits | the app |

### Everyday local development

One terminal, everything:

```bash
npm run start
```

Open http://localhost:7145. The UI calls the API at `VITE_API_BASE_URL` (`http://localhost:5145`).

### Split terminals

Use this when you want raw API logs, including each monitor check.

```bash
# terminal 1 — required for data, checks, SSL, and diagnostics
npm run server

# terminal 2 — frontend with hot reload
npm run dev:frontend
```

The portal monitor is optional for using the UI. Add it only if you want the scheduled portal health snapshots:

```bash
# terminal 3 — optional
npm run monitor:portal
```

### `npm run dev` is not the full app

`npm run dev` runs `src/scripts/api/dev-launcher.ts`. It starts **only** the portal monitor and Vite. It does not start Express.

If the UI loads but monitors stay pending, certificates stay empty, or actions return network errors, the API is not running. Start it with `npm run server`, or stop `npm run dev` and use `npm run start` instead.

Do not run `npm run start` and `npm run server` together. Both try to bind port 5145. Do not run `npm run start` and `npm run dev` together. Both try to bind port 7145 (`strictPort: true` in `vite.config.ts`).

### Production-style local run

Build the frontend, then let the launcher serve `dist/` instead of the Vite dev server:

```bash
npm run build
NODE_ENV=production EULA_ACCEPTED=true npm run start
```

`NODE_ENV=production` makes `start.ts` run `vite preview --host` on port 7145. The API process is the same `server.ts`.

Frontend only, after a build, with the API already running in another terminal:

```bash
npm run preview
```

## What each process does

### Backend — `npm run server`

Entry: `src/scripts/api/server.ts`.

On startup it connects to MySQL, ensures newer columns and tables exist, listens on port 5145, starts the 60-second monitoring loop, and opens the SNMP and syslog listeners when `SNMP_TRAP_ENABLED` and `SYSLOG_ENABLED` are not turned off.

`tsx` does not reload this file when you edit it. After backend changes, stop the process and run `npm run server` again. A frontend refresh is not enough.

If syslog or SNMP prints `EADDRINUSE`, an older API process is still holding 5514 or 9162. The HTTP API can still be up. Stop the extra process if you need those listeners.

### Frontend — `npm run dev:frontend`

Vite on port 7145 with hot reload. Source changes show up here. A separate `vite preview` on the same port serves an older build from `dist/` and will not show current source.

### Portal monitor — `npm run monitor:portal`

Entry: `src/scripts/monitoring/portal-monitor.ts`.

Twice a day (default `00:00,12:00`, override with `PORTAL_MONITOR_RUN_TIMES`) it checks the frontend and backend, records a database snapshot, runs `npm audit`, and posts audit events to the API. It needs `PORTAL_MONITOR_KEY` in `.env` to match the API.

`PORTAL_MONITOR_RUN_ONCE=true` runs one cycle and exits. `npm run dev` forces this to `false` so the monitor stays scheduled.

## Ports

| Port | Owner |
|---|---|
| 7145 | Vite dev server or `vite preview` |
| 5145 | Express API |
| 3306 | MySQL |
| 9162/udp | SNMP traps |
| 5514/udp and 5514/tcp | Syslog |

If 7145 is already taken, Vite exits because `strictPort` is on. Find the listener with `lsof -nP -iTCP:7145 -sTCP:LISTEN` and stop the extra Vite or preview process.

## Installed service (`beacynctl`)

`deployment/install.sh` installs the app as a background service and the `beacynctl` CLI (`src/scripts/cli/beacynctl.sh`). That path is for a machine install, not for day-to-day coding in this repo.

```bash
bash deployment/install.sh
beacynctl status
beacynctl health
beacynctl logs -f
beacynctl start
beacynctl stop
beacynctl restart
```

`beacynctl` needs the config file written by the installer. Running the script from the repo without that install prints a missing-config error. Full command list: `beacynctl help`, and [beacyn-service-management.md](beacyn-service-management.md).

## Docker and Podman

These start the app and MySQL in containers. They do not use `npm run start` on the host.

Docker:

```bash
cd deployment/docker
cp .env.docker .env.docker.local
docker compose --env-file .env.docker.local up -d
```

Podman:

```bash
cd deployment/podman
cp .env.podman .env.podman.local
podman compose -f podman-compose.yml --env-file .env.podman.local up -d --build
```

NGINX and Cloudflare tunnel profiles are documented in [deployment/docker/README.md](../deployment/docker/README.md) and [deployment/podman/README.md](../deployment/podman/README.md).

## Quick choice

| Goal | Command |
|---|---|
| Run everything locally | `npm run start` |
| Code the UI and watch the API logs | `npm run server` and `npm run dev:frontend` |
| UI only, API already running | `npm run dev:frontend` |
| API only | `npm run server` |
| Serve a production build locally | `npm run build`, then `NODE_ENV=production npm run start` |
| Self-host with Docker | `deployment/docker` |
| Install as a system service | `bash deployment/install.sh` |
