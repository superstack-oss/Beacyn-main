# Beacyn — Docker Deployment Guide

## Prerequisites

### Install Docker

**macOS**
```bash
# Option A — Docker Desktop (recommended)
brew install --cask docker
# Open Docker Desktop from Applications and wait for it to start.

# Option B — OrbStack (lightweight alternative)
brew install --cask orbstack
```

**Linux (Ubuntu / Debian)**
```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER   # allow running docker without sudo (re-login required)
```

**Windows**
Download and install [Docker Desktop for Windows](https://docs.docker.com/desktop/install/windows-install/).

Verify the installation:
```bash
docker --version
docker compose version
```

---

## Quick Start

```bash
# 1. Clone / navigate to the repo
cd deployment/docker

# 2. Copy the env template and fill in your values
cp .env.docker .env.docker.local

# 3. Start app + MySQL
docker compose --env-file .env.docker.local up -d

# 4. Follow logs
docker compose --env-file .env.docker.local logs -f
```

The frontend will be available at `http://localhost:7145` and the backend API at `http://localhost:5145`.

---

## Environment File

All configuration lives in `.env.docker` (template). Copy it and edit:

```bash
cp .env.docker .env.docker.local
```

| Variable | Required | Default | Description |
|---|---|---|---|
| `MYSQL_ROOT_PASSWORD` | **Yes** | `Password@123` | MySQL root password — change before production use |
| `DB_NAME` | No | `pulseiq` | Main application database name |
| `INFRA_DB_NAME` | No | `bsa` | Agent telemetry database name |
| `DB_EXPOSE_PORT` | No | `3316` | Host port MySQL is exposed on (avoids clash with local MySQL on 3306) |
| `BACKEND_PORT` | No | `5145` | Host port for the Express backend API |
| `FRONTEND_PORT` | No | `7145` | Host port for the compiled frontend |
| `VITE_API_BASE_URL` | **Yes** | `http://localhost:5145` | Backend API URL **baked into the JS bundle** — set to your public URL before building |
| `VITE_APP_URL` | No | `http://localhost:7145` | Frontend URL shown in the app |
| `NGINX_HTTP_PORT` | No | `80` | NGINX profile: host HTTP port |
| `NGINX_HTTPS_PORT` | No | `443` | NGINX profile: host HTTPS port |
| `CLOUDFLARE_TUNNEL_TOKEN` | **Yes (cloudflare profile)** | — | Cloudflare Tunnel token from Zero Trust dashboard |
| `SNMP_COMMUNITY` | No | `public` | SNMP community string |
| `SNMP_TRAP_ENABLED` | No | `true` | Enable SNMP trap receiver |
| `SNMP_TRAP_PORT` | No | `9162` | SNMP trap listener port |
| `SYSLOG_ENABLED` | No | `true` | Enable syslog receiver |
| `SYSLOG_UDP_PORT` | No | `5514` | Syslog UDP listener port |
| `SYSLOG_TCP_PORT` | No | `5514` | Syslog TCP listener port |
| `OBSERVABILITY_AI_ENABLED` | No | `false` | Enable AI-powered observability |
| `OPENAI_API_KEY` | No | — | OpenAI API key |
| `GEMINI_API_KEY` | No | — | Google Gemini API key |
| `SNOW_INSTANCE_URL` | No | — | ServiceNow instance URL |
| `SNOW_USERNAME` | No | — | ServiceNow username |
| `SNOW_PASSWORD` | No | — | ServiceNow password |

> **Important:** `VITE_API_BASE_URL` is baked into the JavaScript bundle at build time.
> If you change it you must rebuild the image: `docker compose build`

---

## Exposure Profiles

Beacyn supports three deployment modes via Docker Compose profiles.

### Default — localhost only

App and MySQL ports are bound to the Docker host only. Suitable for local development or single-machine use.

```bash
docker compose --env-file .env.docker.local up -d
```

```
Browser → http://localhost:7145   (frontend)
Browser → http://localhost:5145   (backend API)
```

---

### NGINX — private network / LAN

Adds an NGINX reverse proxy that listens on port 80 (and optionally 443) and routes traffic to the app containers. Use this for private server or LAN deployments.

```bash
docker compose --env-file .env.docker.local --profile nginx up -d
```

```
Browser → http://<server-ip>      (frontend via NGINX)
Browser → http://<server-ip>/api  (backend API via NGINX)
```

**Optional SSL**

Place your certificate files in `nginx/certs/`:
```
nginx/certs/cert.pem    # certificate chain
nginx/certs/key.pem     # private key
```

Then uncomment the HTTPS server block in `nginx/nginx.conf`.

---

### Cloudflare Tunnel — public internet

Exposes the app to the internet through a Cloudflare Zero Trust Tunnel without opening any firewall ports. Requires a free Cloudflare account.

**Setup steps:**

1. Log in to [Cloudflare Zero Trust](https://one.dash.cloudflare.com) → **Networks → Tunnels → Create a tunnel**.
2. Choose **Cloudflared** as the connector type and copy the tunnel token.
3. Under **Public Hostnames**, add two routes:

   | Subdomain | Service |
   |---|---|
   | `app.yourdomain.com` | `http://app:7145` |
   | `api.yourdomain.com` | `http://app:5145` |

4. Set `VITE_API_BASE_URL=https://api.yourdomain.com` in your env file, then rebuild:
   ```bash
   docker compose --env-file .env.docker.local build
   ```

5. Add the token to your env file:
   ```
   CLOUDFLARE_TUNNEL_TOKEN=your-token-here
   ```

6. Start:
   ```bash
   docker compose --env-file .env.docker.local --profile cloudflare up -d
   ```

> **MySQL over Cloudflare** — TCP tunneling for MySQL requires a separate Cloudflare Access TCP application. Configure it in Zero Trust → **Access → Applications → Add TCP application** pointing to `beacyn-db:3306`.

---

### NGINX + Cloudflare (combined)

Run both profiles together — NGINX for LAN access and Cloudflare for public access simultaneously.

```bash
docker compose --env-file .env.docker.local --profile nginx --profile cloudflare up -d
```

---

## Build

The image must be rebuilt whenever `VITE_API_BASE_URL` or source code changes.

```bash
# Build only
docker compose --env-file .env.docker.local build

# Build and start
docker compose --env-file .env.docker.local up -d --build
```

---

## Common Commands

```bash
# Start (background)
docker compose --env-file .env.docker.local up -d

# Start with NGINX
docker compose --env-file .env.docker.local --profile nginx up -d

# Start with Cloudflare Tunnel
docker compose --env-file .env.docker.local --profile cloudflare up -d

# View live logs (all containers)
docker compose --env-file .env.docker.local logs -f

# View logs for a specific container
docker compose --env-file .env.docker.local logs -f app
docker compose --env-file .env.docker.local logs -f beacyn-db
docker compose --env-file .env.docker.local logs -f nginx

# Stop
docker compose --env-file .env.docker.local down

# Stop and delete database volume  ⚠ destroys all data
docker compose --env-file .env.docker.local down -v

# Restart a single service
docker compose --env-file .env.docker.local restart app

# Open a shell in the app container
docker compose --env-file .env.docker.local exec app sh

# Connect to MySQL
docker compose --env-file .env.docker.local exec beacyn-db mysql -u root -p
```

---

## Container Overview

| Container | Image | Purpose |
|---|---|---|
| `beacyn-app` | `beacyn-app:2.0.1` (built locally) | Node.js app — Express API + Vite frontend |
| `beacyn-db` | `mysql:8.0` | MySQL 8 database |
| `beacyn-nginx` | `nginx:1.27-alpine` | Reverse proxy (profile: `nginx`) |
| `beacyn-cloudflared` | `cloudflare/cloudflared:latest` | Cloudflare Tunnel connector (profile: `cloudflare`) |

---

## Startup Sequence

On every container start, `docker-entrypoint.sh` runs before the app launches:

1. Validates required environment variables
2. Confirms the compiled frontend (`/app/dist`) exists
3. Waits for MySQL to be reachable (up to 90 seconds)
4. Runs `db/initDb.ts` — creates / migrates the database schema (idempotent)
5. Starts the Beacyn platform via `tsx src/scripts/start.ts`

On first MySQL bootstrap (empty volume), MySQL also runs files under `mysql-init/`:

1. Creates `bsa` database and root grants
2. Imports `db/pulseiq_schema.sql` into `pulseiq`
3. Imports `db/bsa_schema.sql` into `bsa`

This import happens only once for a fresh MySQL data volume.

---

## Troubleshooting

**App fails to start — `DB_HOST is required`**
Ensure you are passing `--env-file .env.docker.local` to every `docker compose` command.

**App fails to start — frontend build not found**
The image needs rebuilding: `docker compose build`

**MySQL keeps restarting**
Check logs: `docker compose logs beacyn-db`. A common cause is a wrong `MYSQL_ROOT_PASSWORD` on a pre-existing volume. Reset with: `docker compose down -v` (deletes data).

**NGINX returns 502 Bad Gateway**
The app container is not yet healthy. Wait 30–60 seconds after first start for MySQL init and schema migration to complete.

**Cloudflare Tunnel shows "offline"**
Verify `CLOUDFLARE_TUNNEL_TOKEN` is correct and the tunnel is active in the Zero Trust dashboard.

**Port already in use**
Change `BACKEND_PORT`, `FRONTEND_PORT`, or `DB_EXPOSE_PORT` in your env file.

**Updated schema files but tables did not change**
MySQL init scripts run only on first boot of an empty volume. Recreate with:
`docker compose --env-file .env.docker.local down -v && docker compose --env-file .env.docker.local up -d --build`

Behavior now:

On first MySQL bootstrap with empty volume:
creates bsa
imports pulseiq schema into pulseiq
imports bsa schema into bsa
On later restarts, MySQL init scripts do not rerun (standard MySQL Docker behavior).
Important if you already started once:

To apply these schema imports on an existing setup, recreate DB volume:
docker compose --env-file .env.docker down -v
docker compose --env-file .env.docker up -d --build
