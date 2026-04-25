# Beacyn — Docker Setup

**Container:** `beacyn-docker-1.0`  
**Image:** `beacyn-app:2.0.1`  
**Database:** MySQL 8.0 (`beacyn-mysql-1.0`)

---

## Prerequisites

| Tool | Minimum version |
|------|----------------|
| Docker Engine | 24+ |
| Docker Compose plugin | v2.20+ |

---

## Quick Start (local machine)

```bash
# 1. Navigate to the Docker config directory
cd container-engines/docker

# 2. Create your local env file from the template
cp .env.docker .env.docker.local

# 3. Edit the two required passwords
#    MYSQL_ROOT_PASSWORD and DB_PASSWORD must be changed before first start
nano .env.docker.local   # or open in any editor

# 4. Build the image and start all services
docker compose --env-file .env.docker.local up -d --build

# 5. Follow logs
docker compose logs -f
```

Once running:

| Service | URL |
|---------|-----|
| Frontend (UI) | http://localhost:7145 |
| Backend API | http://localhost:5145 |
| MySQL (host) | localhost:3316 |

---

## Remote / Production Deployment

The frontend JavaScript bundle has the API URL baked in at build time.  
For a remote server, rebuild passing your server's address as a build argument:

```bash
docker compose --env-file .env.docker.local build \
  --build-arg VITE_API_BASE_URL=http://203.0.113.10:5145

docker compose --env-file .env.docker.local up -d
```

---

## Services

### `beacyn-docker-1.0` (app)

- Multi-stage build: Stage 1 compiles the Vite frontend; Stage 2 runs the Express backend + `vite preview`.
- `NODE_ENV=production` causes `start.ts` to launch `vite preview` (serving the compiled `dist/`) instead of the Vite dev server.
- `EULA_ACCEPTED=true` skips the interactive EULA prompt automatically.
- On startup the entrypoint waits for MySQL, runs `db/initDb.ts` (idempotent schema migration), then starts all platform processes.

### `beacyn-mysql-1.0` (db)

- MySQL 8.0 with a named volume (`beacyn-mysql-data`) for persistence.
- `mysql-init/01-init-bsa.sh` runs once on fresh volume initialisation:
  - Creates the `bsa` database (agent telemetry / health events).
  - Grants the application user full access to both `pulseiq` and `bsa`.
- Exposed on host port **3316** by default (avoids clash with a local MySQL on 3306).

---

## Environment Variables

Copy `.env.docker` to `.env.docker.local` and fill in:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MYSQL_ROOT_PASSWORD` | ✅ | — | MySQL root password |
| `DB_PASSWORD` | ✅ | — | Application DB user password |
| `DB_USER` | | `beacyn` | MySQL application user |
| `DB_NAME` | | `pulseiq` | Primary database name |
| `INFRA_DB_NAME` | | `bsa` | Agent infrastructure database |
| `VITE_API_BASE_URL` | | `http://localhost:5145` | API URL seen by the browser (baked at build time) |
| `BACKEND_PORT` | | `5145` | Host port for the API |
| `FRONTEND_PORT` | | `7145` | Host port for the UI |
| `DB_EXPOSE_PORT` | | `3316` | Host port for direct MySQL access |
| `OPENAI_API_KEY` | | — | Enable AI observability (optional) |
| `GEMINI_API_KEY` | | — | Enable Gemini AI (optional) |

---

## Common Operations

```bash
# Start (detached)
docker compose --env-file .env.docker.local up -d

# Stop and remove containers (data volume preserved)
docker compose down

# Full reset — removes all data ⚠
docker compose down -v

# Rebuild after code changes
docker compose --env-file .env.docker.local build --no-cache
docker compose --env-file .env.docker.local up -d

# Open a shell in the app container
docker exec -it beacyn-docker-1.0 sh

# Open a MySQL session
docker exec -it beacyn-mysql-1.0 mysql -u beacyn -p pulseiq

# View logs for a specific service
docker compose logs -f app
docker compose logs -f beacyn-db
```

---

## Directory Layout

```
container-engines/docker/
├── Dockerfile                  Multi-stage build definition
├── docker-compose.yml          Service orchestration
├── docker-entrypoint.sh        Container bootstrap (wait-for-db → init → start)
├── .env.docker                 Environment variable template
├── mysql-init/
│   └── 01-init-bsa.sh          Creates bsa DB + grants on first MySQL start
└── README.md                   This file
```

---

## Ports Summary

| Port | Protocol | Service | Purpose |
|------|----------|---------|---------|
| 7145 | HTTP | Frontend | Vite preview (compiled React app) |
| 5145 | HTTP | Backend | Express REST API |
| 3316 | TCP | MySQL | Direct DB access from host |
| 9162 | UDP | Backend | SNMP trap receiver |
| 5514 | UDP/TCP | Backend | Syslog collector |

> SNMP and Syslog ports are bound inside the container but not exposed in the default compose file. Add them to `ports:` under the `app:` service if needed.

---

## Troubleshooting

**Container exits immediately**  
Run `docker compose logs app` — most likely the DB_PASSWORD or MYSQL_ROOT_PASSWORD is missing from your `.env.docker.local`.

**Frontend shows "Failed to fetch"**  
`VITE_API_BASE_URL` was baked with the wrong value at build time. Set the correct URL in `.env.docker.local` and rebuild: `docker compose build --no-cache`.

**MySQL init script didn't run**  
Init scripts only execute when the data volume is empty (first start). To re-run them: `docker compose down -v` then `up -d --build`.

**`dist/` not found in container**  
The image was pulled without being built. Run `docker compose build` to create the image locally.
