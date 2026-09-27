# syntax=docker/dockerfile:1
# =============================================================================
# Beacyn — multi-stage image
#
# Stage 1  builder  — installs dependencies and compiles the Vite frontend
# Stage 2  runtime  — production dependencies plus the tools the launcher needs
#
# Build args (baked into the browser bundle):
#   VITE_API_BASE_URL   API origin the browser calls. Default http://localhost:5145
#   VITE_APP_URL        Frontend origin. Default http://localhost:7145
#
# Published tag: superstackinc/beacyn:latest
# =============================================================================

FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
COPY . .

ARG VITE_API_BASE_URL=http://localhost:5145
ARG VITE_APP_URL=http://localhost:7145
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL \
    VITE_APP_URL=$VITE_APP_URL

# Install, build, then drop node_modules in the same layer so the
# runtime stage is not unpacked beside a second full dependency tree.
RUN npm ci --engine-strict=false \
 && npm run build \
 && test -s dist/index.html \
 && rm -rf node_modules /root/.npm /tmp/*

# ── Runtime ───────────────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime

LABEL maintainer="Beacyn Labs <support@beacyn.io>"
LABEL org.opencontainers.image.title="Beacyn"
LABEL org.opencontainers.image.description="Enterprise Infrastructure Monitoring & Observability"
LABEL org.opencontainers.image.version="2.0.1"
LABEL org.opencontainers.image.vendor="Beacyn Labs"
LABEL org.opencontainers.image.source="https://github.com/superstack-oss/Beacyn-main"
LABEL org.opencontainers.image.licenses="LicenseRef-Beacyn-EULA"

WORKDIR /app

# This copy waits for the frontend build, so runtime npm ci does not
# run at the same time as the builder install.
COPY --from=builder /app/dist /opt/beacyn-dist

# tini reaps the API, Vite preview, and portal-monitor children.
# iputils supplies ping for monitor probes. The file capability lets the
# unprivileged node user send ICMP.
RUN apk add --no-cache tini iputils libcap \
 && if [ -x /bin/ping ]; then setcap cap_net_raw+ep /bin/ping || true; fi

COPY package.json package-lock.json ./
# Production modules, then the dev tools the production launcher still executes:
# tsx runs the API and portal monitor; vite preview serves dist/ and loads vite.config.ts.
RUN npm ci --omit=dev --engine-strict=false \
 && npm install --no-save --no-package-lock --engine-strict=false \
      tsx \
      vite \
      @vitejs/plugin-react \
      @rolldown/plugin-babel \
      @babel/core \
      babel-plugin-react-compiler \
 && find node_modules -type f -name '*.map' -delete \
 && npm cache clean --force \
 && rm -rf /root/.npm

COPY --chown=node:node src/ ./src/
COPY --chown=node:node db/ ./db/
COPY --chown=node:node public/ ./public/
COPY --chown=node:node index.html ./
COPY --chown=node:node tsconfig.json tsconfig.app.json tsconfig.node.json tsconfig.server.json ./
COPY --chown=node:node vite.config.ts ./
RUN mv /opt/beacyn-dist /app/dist && chown -R node:node /app/dist
COPY deployment/docker/docker-entrypoint.sh /docker-entrypoint.sh

RUN chmod 755 /docker-entrypoint.sh \
 && mkdir -p /home/node \
 && chown -R node:node /app /home/node

USER node

ENV NODE_ENV=production \
    EULA_ACCEPTED=true \
    HOME=/home/node \
    NPM_CONFIG_UPDATE_NOTIFIER=false

EXPOSE 5145 7145 9162/udp 5514/tcp 5514/udp

STOPSIGNAL SIGTERM

HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:5145/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--", "/docker-entrypoint.sh"]
