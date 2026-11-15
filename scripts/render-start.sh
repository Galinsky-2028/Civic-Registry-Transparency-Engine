#!/bin/sh
set -eu

# Derive server-side principal digests from the deployment's role credentials.
# The console stays disabled when no credentials are configured.
CIVIC_REGISTRY_ADMIN_PRINCIPALS="$(node scripts/admin-principals.mjs)"
export CIVIC_REGISTRY_ADMIN_PRINCIPALS

# Stop before accepting traffic if migrations or first-run setup fail.
node packages/database/src/bootstrap.ts
cd apps/web
exec node node_modules/next/dist/bin/next start --hostname 0.0.0.0 --port "${PORT:-3000}"
