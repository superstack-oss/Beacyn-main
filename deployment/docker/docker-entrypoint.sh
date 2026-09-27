#!/bin/sh
# Superseded by /app/docker-entrypoint.mjs.
# The hardened image has no shell, so this file is not the image entrypoint.
# Hosts that still exec this path (and have a shell) land on the Node bootstrap.
exec node /app/docker-entrypoint.mjs "$@"
