# NGINX Deployment Guide (Public and Private Reverse Proxy)

This guide explains how to run Beacyn with NGINX reverse proxy using the stack in [deployment/ngnix](../deployment/ngnix).

## What this stack provides

- NGINX reverse proxy on port `80` (and optional `443`)
- Frontend proxy route to app frontend (`app:7145`)
- Backend API proxy route to app backend (`app:5145`)
- Health check route
- MySQL service with schema initialization for both databases

Routing behavior from [deployment/ngnix/nginx.conf](../deployment/ngnix/nginx.conf):

- `/api/*` -> backend API (`app:5145`)
- `/health` -> backend health (`app:5145/health`)
- `/*` -> frontend (`app:7145`)

## One-command run

From repository root:

```bash
docker compose -f deployment/ngnix/docker-compose.yml --env-file deployment/ngnix/.env.ngnix up -d --build
```

## Stop

```bash
docker compose -f deployment/ngnix/docker-compose.yml --env-file deployment/ngnix/.env.ngnix down
```

## Reset (deletes DB data)

```bash
docker compose -f deployment/ngnix/docker-compose.yml --env-file deployment/ngnix/.env.ngnix down -v
```

## Environment file

Default env file: [deployment/ngnix/.env.ngnix](../deployment/ngnix/.env.ngnix)

Key values you may change:

- `NGINX_HTTP_PORT` default `80`
- `NGINX_HTTPS_PORT` default `443`
- `BACKEND_PORT` default `5145`
- `FRONTEND_PORT` default `7145`
- `DB_EXPOSE_PORT` default `3316`
- `MYSQL_ROOT_PASSWORD` default `Password@123` (change this)
- `VITE_API_BASE_URL` (baked into frontend at build time)

If you change `VITE_API_BASE_URL`, rebuild the image:

```bash
docker compose -f deployment/ngnix/docker-compose.yml --env-file deployment/ngnix/.env.ngnix up -d --build
```

## Private network deployment (LAN/internal)

Use HTTP only and keep the stack behind a private network or VPN.

1. Keep `NGINX_HTTP_PORT=80`
2. Leave TLS section in [deployment/ngnix/nginx.conf](../deployment/ngnix/nginx.conf) commented
3. Access:

- `http://<server-ip>/` frontend
- `http://<server-ip>/api/...` backend API
- `http://<server-ip>/health` backend health

## Public internet deployment

You have two common options:

1. TLS termination in this NGINX
2. TLS termination in an upstream load balancer/CDN

### Option A: TLS in this NGINX

1. Put certificates in [deployment/ngnix/certs](../deployment/ngnix/certs)
   - `cert.pem`
   - `key.pem`
2. Uncomment HTTPS server block in [deployment/ngnix/nginx.conf](../deployment/ngnix/nginx.conf)
3. Optionally add HTTP -> HTTPS redirect in the port `80` server
4. Start stack

### Option B: TLS upstream (Cloudflare/ALB/NLB/etc.)

1. Keep NGINX HTTP listener as-is
2. Terminate TLS upstream
3. Forward traffic to NGINX HTTP port
4. Preserve forwarded headers (`X-Forwarded-For`, `X-Forwarded-Proto`)

## Database initialization behavior

On first MySQL boot (empty volume):

1. `pulseiq` is created from `MYSQL_DATABASE`
2. `bsa` is created from init SQL
3. Schema imports run from:
   - [db/pulseiq_schema.sql](../db/pulseiq_schema.sql)
   - [db/bsa_schema.sql](../db/bsa_schema.sql)

If schema files are changed later, recreate DB volume:

```bash
docker compose -f deployment/ngnix/docker-compose.yml --env-file deployment/ngnix/.env.ngnix down -v
docker compose -f deployment/ngnix/docker-compose.yml --env-file deployment/ngnix/.env.ngnix up -d --build
```

## Validation and logs

View all logs:

```bash
docker compose -f deployment/ngnix/docker-compose.yml --env-file deployment/ngnix/.env.ngnix logs -f
```

View NGINX logs:

```bash
docker compose -f deployment/ngnix/docker-compose.yml --env-file deployment/ngnix/.env.ngnix logs -f nginx
```

Check NGINX config inside container:

```bash
docker compose -f deployment/ngnix/docker-compose.yml --env-file deployment/ngnix/.env.ngnix exec nginx nginx -t
```

## Troubleshooting

NGINX returns `502 Bad Gateway`:

- App container is not ready yet
- Check `app` logs and wait for DB init completion

Frontend loads but API fails:

- Confirm `VITE_API_BASE_URL` is correct
- Rebuild after changing it

MySQL not initializing schema:

- Initialization scripts run once per fresh volume
- Use `down -v` and start again

Port already in use:

- Change `NGINX_HTTP_PORT`, `NGINX_HTTPS_PORT`, `FRONTEND_PORT`, `BACKEND_PORT`, `DB_EXPOSE_PORT`

## Files involved

- [deployment/ngnix/nginx.conf](../deployment/ngnix/nginx.conf)
- [deployment/ngnix/docker-compose.yml](../deployment/ngnix/docker-compose.yml)
- [deployment/ngnix/.env.ngnix](../deployment/ngnix/.env.ngnix)
- [deployment/ngnix/certs](../deployment/ngnix/certs)
