#!/bin/sh
# Compatibility wrapper. New images use deployment/docker/docker-entrypoint.sh.
exec /docker-entrypoint.sh "$@"
