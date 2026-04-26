# Beacyn - Podman Deployment Guide

This setup mirrors the Docker setup, but is Podman-native.

## Prerequisites

### macOS
```bash
brew install podman
podman machine init
podman machine start
```

### Linux
```bash
sudo dnf install -y podman podman-compose
# or
sudo apt-get install -y podman podman-compose
```

Verify:
```bash
podman --version
podman compose version
```

## Quick Start

```bash
cd deployment/podman
cp .env.podman .env.podman.local
podman compose -f podman-compose.yml --env-file .env.podman.local up -d --build
```

## Modes

Default (app + db):
```bash
podman compose -f podman-compose.yml --env-file .env.podman.local up -d
```

With NGINX:
```bash
podman compose -f podman-compose.yml --env-file .env.podman.local --profile nginx up -d
```

With Cloudflare tunnel:
```bash
podman compose -f podman-compose.yml --env-file .env.podman.local --profile cloudflare up -d
```

With both:
```bash
podman compose -f podman-compose.yml --env-file .env.podman.local --profile nginx --profile cloudflare up -d
```

## Database Initialization

On first boot with an empty DB volume:
1. `pulseiq` is created by MySQL env (`MYSQL_DATABASE`)
2. `bsa` is created by `mysql-init/01-init-bsa.sql`
3. Schemas are imported:
   - `db/pulseiq_schema.sql` -> `pulseiq`
   - `db/bsa_schema.sql` -> `bsa`

If you change schema files later, reinitialize volume:
```bash
podman compose -f podman-compose.yml --env-file .env.podman.local down -v
podman compose -f podman-compose.yml --env-file .env.podman.local up -d --build
```

## Common Commands

```bash
podman compose -f podman-compose.yml --env-file .env.podman.local logs -f
podman compose -f podman-compose.yml --env-file .env.podman.local down
podman compose -f podman-compose.yml --env-file .env.podman.local down -v
podman compose -f podman-compose.yml --env-file .env.podman.local exec app sh
podman compose -f podman-compose.yml --env-file .env.podman.local exec beacyn-db mysql -u root -p
```
