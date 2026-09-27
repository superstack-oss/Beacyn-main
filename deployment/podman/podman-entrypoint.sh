#!/bin/sh
# Compatibility wrapper. The hardened image starts with:
#   /sbin/tini -- node /app/docker-entrypoint.mjs
exec node /app/docker-entrypoint.mjs "$@"
