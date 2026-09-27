![](https://img.shields.io/github/license/bluewave-labs/checkmate)

# Beacyn EMO

Enterprise infrastructure monitoring and observability platform for uptime, services, network, databases, and operations visibility.

Beacyn provides a modern monitoring portal with infrastructure telemetry, status tracking, diagnostics, and operational tooling designed for self-hosted environments.

## Why Beacyn

- Unified monitoring across websites, ports, ping, SSL, Docker, SNMP, and syslog sources
- Full-stack architecture with React frontend and Express API backend
- Built-in operational workflows (audit trails, incidents, maintenance, service management)
- Self-hosted deployment options for Docker, Podman, and NGINX reverse proxy setups
- CLI-based lifecycle and runtime management via `beacynctl`

## Core Features

- Uptime and response monitoring
- Infrastructure insights and device visibility
- Status pages and broadcast announcements
- Audit and runtime snapshot capabilities
- Syslog ingestion and SNMP integrations
- Database monitoring and diagnostics tooling
- Maintenance mode orchestration

## Tech Stack

- Frontend: React 19, TypeScript, Vite
- Backend: Node.js, Express 5, TypeScript
- Database: MySQL 8
- Deployment: Docker, Podman, NGINX, Cloudflare Tunnel-ready topology

## Quick Start (Local Development)

### Prerequisites

- Node.js 20+
- MySQL 8+

### 1. Install dependencies

```bash
npm ci
```

### 2. Configure environment

Create and configure your `.env` file at repository root.

Minimum expected values:

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your-password
DB_NAME=pulseiq
INFRA_DB_NAME=bsa
PORT=5145
VITE_APP_URL=http://localhost:7145
NODE_ENV=development
```

### 3. Initialize database schema

```bash
npm run initdb
```

### 4. Run services

```bash
npm run start
```

This starts:

- API server
- Frontend server
- Portal monitor

## Scripts

- `npm run start` - start platform launcher
- `npm run dev` - run dev launcher flow
- `npm run server` - run API server only
- `npm run monitor:portal` - run portal monitor only
- `npm run initdb` - initialize/migrate database schema
- `npm run build` - compile TypeScript and build frontend assets
- `npm run lint` - run lint checks

## Deployment

Use the deployment bundles under [deployment](deployment):

- Docker: [deployment/docker](deployment/docker)
- Podman: [deployment/podman](deployment/podman)
- NGINX reverse proxy stack: [deployment/ngnix](deployment/ngnix)
- Guided installer: [deployment/install.sh](deployment/install.sh)

## Documentation

- How to run the project: [docs/how-to-run.md](docs/how-to-run.md)
- Service management CLI: [docs/beacyn-service-management.md](docs/beacyn-service-management.md)
- Deployment and scripts architecture: [docs/deployment-and-scripts.md](docs/deployment-and-scripts.md)
- Docker guide: [docs/docker.md](docs/docker.md)
- Podman guide: [docs/podman.md](docs/podman.md)
- NGINX guide: [docs/ngnix.md](docs/ngnix.md)
- Syslog integration: [docs/syslog-integration.md](docs/syslog-integration.md)
- Privacy policy: [docs/privacy.md](docs/privacy.md)
- Terms: [docs/terms.md](docs/terms.md)

## Repository Structure

```text
src/
  scripts/
    api/
    cli/
    monitoring/
    start.ts
deployment/
  docker/
  podman/
  ngnix/
  install.sh
docs/
db/
```

## Security and Data Safety

- Installer includes database overwrite consent prompts for existing `pulseiq` and `bsa` databases.
- Configuration and runtime controls are available via `beacynctl`.
- Secrets should be managed through environment configuration and restricted file permissions.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make changes with tests/validation
4. Open a pull request with clear context

For major changes, include migration notes and operational impact details.

## Support

For setup guidance, use the documentation links above. For operational help, begin with the CLI guide in [docs/beacyn-service-management.md](docs/beacyn-service-management.md).