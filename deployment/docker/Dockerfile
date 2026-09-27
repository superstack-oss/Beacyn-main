# syntax=docker/dockerfile:1
# =============================================================================
# Beacyn — multi-stage image on Docker Hardened Images
#
# Stage 1  builder  — dhi.io/node dev image (shell + apk). Compiles the
#                     frontend, installs production modules, and stages the
#                     few binaries the runtime still needs.
# Stage 2  runtime  — dhi.io/node hardened image. No shell, no package
#                     manager. Runs as the non-root node user.
#
# MySQL, nginx, and cloudflared stay on their own images. Their entrypoints
# are shell scripts and are not part of this build.
#
# Build args (baked into the browser bundle):
#   VITE_API_BASE_URL   API origin the browser calls. Default http://localhost:5145
#   VITE_APP_URL        Frontend origin. Default http://localhost:7145
#
# Published tag: superstackinc/beacyn:latest
# =============================================================================

FROM dhi.io/node:22-alpine3.23-dev AS builder

WORKDIR /app

COPY package.json package-lock.json ./
COPY . .

ARG VITE_API_BASE_URL=http://localhost:5145
ARG VITE_APP_URL=http://localhost:7145
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL \
    VITE_APP_URL=$VITE_APP_URL

# One layer: build, drop the dev tree, then install only what production runs.
# tsx runs the API and portal monitor; vite preview serves dist/ and loads vite.config.ts.
RUN npm ci --engine-strict=false \
 && npm run build \
 && test -s dist/index.html \
 && rm -rf node_modules \
 && npm ci --omit=dev --engine-strict=false \
 && npm install --no-save --no-package-lock --engine-strict=false \
      tsx \
      vite \
      @vitejs/plugin-react \
      @rolldown/plugin-babel \
      @babel/core \
      babel-plugin-react-compiler \
 && test -f node_modules/tsx/dist/cli.mjs \
 && find node_modules -type f -name '*.map' -delete \
 && npm cache clean --force \
 && rm -rf /root/.npm /tmp/*

# The hardened runtime cannot apk-add. Stage tini (PID 1), ping (ICMP probes),
# and the libcap SONAME ping needs. File capability lets the node user send ICMP.
RUN apk add --no-cache tini iputils libcap \
 && mkdir -p /opt/beacyn-extra/bin /opt/beacyn-extra/lib \
 && cp -a /sbin/tini /opt/beacyn-extra/bin/tini \
 && cp -a /bin/ping /opt/beacyn-extra/bin/ping \
 && setcap cap_net_raw+ep /opt/beacyn-extra/bin/ping \
 && libcap="$(find /usr/lib /lib -name 'libcap.so.*' -type f | head -n 1)" \
 && test -n "$libcap" \
 && cp -a "$libcap" /opt/beacyn-extra/lib/libcap.so.2 \
 && chmod 755 /opt/beacyn-extra/bin/tini /opt/beacyn-extra/bin/ping /opt/beacyn-extra/lib/libcap.so.2

# The launcher records EULA acceptance in /app, which the runtime user cannot create.
# Seeding the marker keeps that write from failing. EULA_ACCEPTED=true is still set.
RUN printf '%s\n' 'baked into the image' 'Version: 2.0.1' > /app/.eula-accepted \
 && chmod 644 /app/.eula-accepted

# ── Runtime ───────────────────────────────────────────────────────────────────
FROM dhi.io/node:22-alpine3.23 AS runtime

LABEL maintainer="Beacyn Labs <support@beacyn.io>"
LABEL org.opencontainers.image.title="Beacyn"
LABEL org.opencontainers.image.description="Enterprise Infrastructure Monitoring & Observability"
LABEL org.opencontainers.image.version="2.0.1"
LABEL org.opencontainers.image.vendor="Beacyn Labs"
LABEL org.opencontainers.image.source="https://github.com/superstack-oss/Beacyn-main"
LABEL org.opencontainers.image.licenses="LicenseRef-Beacyn-EULA"

WORKDIR /app

COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/src ./src
COPY --from=builder --chown=node:node /app/db ./db
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node \
     /app/index.html \
     /app/package.json \
     /app/package-lock.json \
     /app/vite.config.ts \
     /app/tsconfig.json \
     /app/tsconfig.app.json \
     /app/tsconfig.node.json \
     /app/tsconfig.server.json \
     ./
COPY --from=builder --chown=node:node /app/deployment/docker/docker-entrypoint.mjs ./docker-entrypoint.mjs
COPY --from=builder --chown=node:node /app/.eula-accepted ./.eula-accepted

COPY --from=builder /opt/beacyn-extra/bin/tini /sbin/tini
COPY --from=builder /opt/beacyn-extra/bin/ping /bin/ping
COPY --from=builder /opt/beacyn-extra/lib/libcap.so.2 /usr/lib/libcap.so.2
# npm CLI only, so the portal monitor can still run `npm audit`.
COPY --from=builder /usr/lib/node_modules/npm /usr/lib/node_modules/npm
COPY --from=builder /usr/bin/npm /usr/bin/npm
COPY --from=builder /usr/bin/npx /usr/bin/npx

USER node

ENV NODE_ENV=production \
    EULA_ACCEPTED=true \
    HOME=/home/node \
    NPM_CONFIG_UPDATE_NOTIFIER=false

EXPOSE 5145 7145 9162/udp 5514/tcp 5514/udp

STOPSIGNAL SIGTERM

HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=5 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:5145/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

# -s registers tini as a subreaper when Compose also injects its own init as PID 1.
ENTRYPOINT ["/sbin/tini", "-s", "--", "node", "/app/docker-entrypoint.mjs"]
