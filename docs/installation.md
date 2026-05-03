# Installation Guide

This guide covers all supported installation paths for Beacyn:

1. Developer installation (fork + run from source)
2. Direct installation (using `deployment/install.sh`)
3. Container installation (Docker and Podman)
4. `.env` configuration
5. System requirements (contributors vs clients)
6. Troubleshooting common installation issues

---

## 1. System Requirements

## 1.1 For Developers / Contributors

Use this profile if you want to build features, run lint/build, and contribute code.

| Component | Minimum | Recommended |
|---|---|---|
| OS | macOS 13+, Ubuntu 20.04+, Debian 11+, RHEL/CentOS 8+ | Latest stable release |
| CPU | 4 cores | 8+ cores |
| RAM | 8 GB | 16 GB |
| Storage | 15 GB free | 30+ GB SSD |
| Node.js | 20.x LTS | 20.x LTS |
| npm | 10+ | Latest with Node 20 |
| MySQL | 8.0+ | 8.0+ |
| Git | 2.30+ | Latest |

### Required local services
- MySQL reachable from your machine
- Open ports for frontend/backend (defaults: `7145`, `5145`)

---

## 1.2 For Clients (Platform Users / Self-hosters)

Use this profile if you only want to run the platform.

| Deployment style | Minimum |
|---|---|
| Direct (install.sh) | 2 vCPU, 4 GB RAM, 20 GB disk |
| Docker/Podman | 2 vCPU, 6 GB RAM, 25 GB disk |
| Production recommended | 4 vCPU, 8-16 GB RAM, SSD storage |

### Network ports
- Frontend: `7145` (default)
- Backend API: `5145` (default)
- MySQL: `3306` (or custom)
- Optional listeners: SNMP trap `9162`, Syslog `5514` (UDP/TCP)

---

## 2. Developer Installation (Fork from GitHub)

## 2.1 Fork and clone

1. Fork the repository on GitHub.
2. Clone your fork:

```bash
git clone https://github.com/<your-username>/<repo-name>.git
cd <repo-name>
```

3. Add upstream remote:

```bash
git remote add upstream https://github.com/<org>/<repo-name>.git
git remote -v
```

## 2.2 Install dependencies

```bash
npm install
```

## 2.3 Configure environment

Create `.env` in repo root (see full `.env` section below):

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=<your-password>
DB_NAME=pulseiq
INFRA_DB_NAME=bsa
PORT=5145
VITE_APP_URL=http://localhost:7145
EULA_ACCEPTED=true
```

## 2.4 Initialize database

```bash
npm run initdb
```

This prepares application schema for `pulseiq` and required infra structures for `bsa`.

## 2.5 Run the platform

### Preferred single command
```bash
npm run dev
```

### Alternative split run
```bash
# terminal 1
npm run server

# terminal 2
npm run dev:frontend
```

Open:
- Frontend: `http://localhost:7145`
- API: `http://localhost:5145`

## 2.6 Contributor flow

```bash
git checkout -b feature/<your-feature>
# make changes
npm run build
npm run lint
git add .
git commit -m "feat: <summary>"
git push origin feature/<your-feature>
```

Create a PR from your fork to upstream.

---

## 3. Direct Installation (Simplest: install.sh)

The direct installer is the easiest way for self-hosting.

Script: `deployment/install.sh`

## 3.1 Run installer

```bash
bash deployment/install.sh
```

## 3.2 What installer does

- Validates OS, Node, MySQL, Git
- Installs missing dependencies (with confirmation)
- Checks default ports (`5145`, `7145`, `3306`)
- Clones/updates source from configured branch
- Runs `npm ci` or `npm install`
- Builds frontend (`npm run build`)
- Writes `.env` with secure file permissions (`chmod 600`)
- Initializes databases (`pulseiq`, `bsa`) and schema
- Registers background service:
  - macOS: `launchd`
  - Linux: `systemd`
  - fallback: `nohup`
- Installs management CLI: `beacynctl`

## 3.3 Useful installer overrides

```bash
BEACYN_REPO_URL=https://github.com/<org>/<repo>.git \
BEACYN_BRANCH=main \
BEACYN_INSTALL_DIR=/opt/beacyn \
EULA_ACCEPTED=true \
BEACYNCTL_AUTO_PATH=true \
bash deployment/install.sh
```

Flags:
- `--no-auto-path` disables automatic PATH update for `beacynctl`
- `-h` / `--help` shows options

## 3.4 Post-install checks

```bash
beacynctl status
beacynctl health
beacynctl logs -f
```

---

## 4. Container-based Installation

## 4.1 Docker Installation

Use: `deployment/docker`

```bash
cd deployment/docker
cp .env.docker .env.docker.local
docker compose --env-file .env.docker.local up -d --build
```

Open:
- Frontend: `http://localhost:7145`
- API: `http://localhost:5145`

### With profiles

```bash
# NGINX profile
docker compose --env-file .env.docker.local --profile nginx up -d

# Cloudflare profile
docker compose --env-file .env.docker.local --profile cloudflare up -d

# Both
docker compose --env-file .env.docker.local --profile nginx --profile cloudflare up -d
```

---

## 4.2 Podman Installation

Use: `deployment/podman`

```bash
cd deployment/podman
cp .env.podman .env.podman.local
podman compose -f podman-compose.yml --env-file .env.podman.local up -d --build
```

### With profiles

```bash
# NGINX
podman compose -f podman-compose.yml --env-file .env.podman.local --profile nginx up -d

# Cloudflare
podman compose -f podman-compose.yml --env-file .env.podman.local --profile cloudflare up -d

# Both
podman compose -f podman-compose.yml --env-file .env.podman.local --profile nginx --profile cloudflare up -d
```

---

## 5. Configuring the .env File

For direct/source installs, use root `.env`.

## 5.1 Minimum required

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=<change-me>
DB_NAME=pulseiq
INFRA_DB_NAME=bsa
PORT=5145
VITE_APP_URL=http://localhost:7145
EULA_ACCEPTED=true
NODE_ENV=production
```

## 5.2 Important optional settings

```env
# AI observability
OBSERVABILITY_AI_ENABLED=false
OPENAI_API_KEY=
GEMINI_API_KEY=

# ServiceNow integration
SNOW_INSTANCE_URL=
SNOW_USERNAME=
SNOW_PASSWORD=

# SNMP/syslog collectors
SNMP_TRAP_ENABLED=true
SNMP_TRAP_PORT=9162
SYSLOG_ENABLED=true
SYSLOG_UDP_PORT=5514
SYSLOG_TCP_PORT=5514
```

## 5.3 Container env files

- Docker: `deployment/docker/.env.docker.local`
- Podman: `deployment/podman/.env.podman.local`

Important note for Docker/Podman:
- `VITE_API_BASE_URL` is embedded at build time. If changed, rebuild image.

```bash
docker compose --env-file .env.docker.local build
# or
podman compose -f podman-compose.yml --env-file .env.podman.local up -d --build
```

## 5.4 Security tips

- Never commit `.env` with real secrets
- Restrict permissions: `chmod 600 .env`
- Rotate DB/API passwords after first setup
- Use read-only DB accounts for monitoring targets when possible

---

## 6. Common Troubleshooting

## 6.1 MySQL connection failed

Symptoms:
- `npm run initdb` fails
- installer shows MySQL connectivity warning

Checks:
```bash
mysql -h <host> -P <port> -u <user> -p -e "SELECT 1;"
```

Fixes:
- Verify `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`
- Ensure MySQL service is running
- Ensure user has create/alter privileges for `pulseiq` and `bsa`

---

## 6.2 Port already in use (`5145`, `7145`, `3306`)

Checks:
```bash
lsof -iTCP:5145 -sTCP:LISTEN
lsof -iTCP:7145 -sTCP:LISTEN
```

Fixes:
- Stop conflicting service
- Or set alternate ports in `.env`
- For containers, change exposed host ports in env file

---

## 6.3 `beacynctl` not found

Checks:
```bash
which beacynctl
```

Fixes:
- Run installer again and allow auto PATH
- Or use full path shown by installer (for example `<install-dir>/bin/beacynctl`)
- Start new shell session after PATH update

---

## 6.4 Build fails on install

Checks:
```bash
node -v
npm -v
npm run build
```

Fixes:
- Ensure Node.js 20.x
- Remove stale modules and reinstall:
```bash
rm -rf node_modules package-lock.json
npm install
npm run build
```

---

## 6.5 Blank UI or API errors after container start

Checks:
```bash
docker compose --env-file .env.docker.local logs -f app
# or
podman compose -f podman-compose.yml --env-file .env.podman.local logs -f app
```

Fixes:
- Set correct `VITE_API_BASE_URL`
- Rebuild containers after changing frontend env values
- Verify API container is healthy and reachable

---

## 6.6 Permission issues on Linux

Symptoms:
- cannot bind service
- cannot read/write logs
- systemd service fails

Fixes:
```bash
sudo chown -R $USER:$USER <install-dir>
sudo systemctl daemon-reload
sudo systemctl restart beacyn
sudo systemctl status beacyn
```

---

## 6.7 EULA prompt blocks non-interactive install

Fix:
```bash
EULA_ACCEPTED=true bash deployment/install.sh
```

---

## 6.8 Reset platform health quickly

```bash
beacynctl doctor
beacynctl validate
beacynctl status --json
beacynctl logs --tail 200
```

---

## 7. Recommended Path by User Type

| User type | Recommended install method |
|---|---|
| Contributor / Developer | Fork + source install |
| Small self-hosted team | Direct `install.sh` |
| Ops / platform team | Docker or Podman + NGINX/Cloudflare |

---

## 8. Next Steps After Installation

1. Login and change default admin password immediately.
2. Configure SMTP/webhook notifications.
3. Add uptime monitors and thresholds.
4. Connect BeacynMonitorAgent™ for infrastructure/database telemetry.
5. Configure Broadcast status pages.
6. Review access roles (RBAC) and audit settings.
