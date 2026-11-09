#!/bin/sh
set -eu

# Stop before accepting traffic if migrations or first-run setup fail.
node packages/database/src/bootstrap.ts
cd apps/web
exec node node_modules/next/dist/bin/next start --hostname 0.0.0.0 --port "${PORT:-3000}"
