# =============================================================================
# Beacyn — Multi-Stage Dockerfile
# Container name : beacyn-docker-1.0
# =============================================================================
#
# STAGE 1  builder  — installs all deps + compiles the Vite frontend
# STAGE 2  runtime  — lean production image with only what is needed at runtime
#
# Build args (override with --build-arg at docker build / compose build time):
#   VITE_API_BASE_URL   Backend API URL seen by the BROWSER (baked into JS bundle)
#                       Default: http://localhost:5145  (works for local Docker)
#                       Remote : http://<server-ip-or-domain>:5145
#   VITE_APP_URL        Frontend URL (used in banner only)
# =============================================================================

# ─── Stage 1: Builder ─────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

LABEL stage="builder"

WORKDIR /app

# Install dependencies first (layer-cached unless package-lock.json changes)
COPY package.json package-lock.json ./
RUN npm ci --engine-strict=false

# Copy full source
COPY . .

# Frontend build-time environment (baked into the JS bundle)
ARG VITE_API_BASE_URL=http://localhost:5145
ARG VITE_APP_URL=http://localhost:7145
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_APP_URL=$VITE_APP_URL

# Compile TypeScript types + build Vite frontend → dist/
RUN npm run build

# ─── Stage 2: Runtime ─────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime

LABEL maintainer="Beacyn Labs <support@beacyn.io>"
LABEL org.opencontainers.image.title="Beacyn"
LABEL org.opencontainers.image.description="Enterprise Infrastructure Monitoring & Observability"
LABEL org.opencontainers.image.version="2.0.1"
LABEL org.opencontainers.image.vendor="Beacyn Labs"

WORKDIR /app

# iputils provides the `ping` binary used by monitor probes
RUN apk add --no-cache iputils

# Install ALL dependencies (tsx + typescript are devDeps but required to run .ts files)
COPY package.json package-lock.json ./
RUN npm ci --engine-strict=false

# Application source files
COPY src/          ./src/
COPY db/           ./db/
COPY public/       ./public/
COPY index.html    ./
COPY tsconfig*.json ./
COPY vite.config.ts ./

# Pre-built frontend from Stage 1 (served by `vite preview` at runtime)
COPY --from=builder /app/dist ./dist/

# Container entrypoint
COPY container-engines/docker/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# ── Runtime defaults ──────────────────────────────────────────────────────────
# NODE_ENV=production  → start.ts launches `vite preview` instead of `vite dev`
# EULA_ACCEPTED=true   → skips interactive EULA prompt (appropriate for containers)
ENV NODE_ENV=production
ENV EULA_ACCEPTED=true

# 5145 — Express backend API
# 7145 — Vite preview (compiled frontend)
EXPOSE 5145 7145

ENTRYPOINT ["/docker-entrypoint.sh"]
