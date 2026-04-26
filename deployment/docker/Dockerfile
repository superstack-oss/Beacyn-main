# =============================================================================
# Beacyn — Multi-Stage Dockerfile
#
# Stage 1  builder  — installs all deps + compiles the Vite frontend
# Stage 2  runtime  — lean production image
#
# Build args:
#   VITE_API_BASE_URL   Backend API URL seen by the browser (baked into JS bundle)
#                       Local:  http://localhost:5145
#                       Remote: http://<server-ip-or-domain>:5145
#   VITE_APP_URL        Frontend URL
# =============================================================================

# ── Stage 1: Builder ──────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --engine-strict=false

COPY . .

ARG VITE_API_BASE_URL=http://localhost:5145
ARG VITE_APP_URL=http://localhost:7145
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_APP_URL=$VITE_APP_URL

RUN npm run build

# ── Stage 2: Runtime ──────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime

LABEL maintainer="Beacyn Labs <support@beacyn.io>"
LABEL org.opencontainers.image.title="Beacyn"
LABEL org.opencontainers.image.description="Enterprise Infrastructure Monitoring & Observability"
LABEL org.opencontainers.image.version="2.0.1"
LABEL org.opencontainers.image.vendor="Beacyn Labs"

WORKDIR /app

# iputils provides the `ping` binary used by monitor probes
RUN apk add --no-cache iputils

COPY package.json package-lock.json ./
RUN npm ci --engine-strict=false

COPY src/          ./src/
COPY db/           ./db/
COPY public/       ./public/
COPY index.html    ./
COPY tsconfig*.json ./
COPY vite.config.ts ./

COPY --from=builder /app/dist ./dist/

COPY deployment/docker/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

ENV NODE_ENV=production
ENV EULA_ACCEPTED=true

EXPOSE 5145 7145

ENTRYPOINT ["/docker-entrypoint.sh"]

ENTRYPOINT ["/docker-entrypoint.sh"]
