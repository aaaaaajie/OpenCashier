#!/bin/sh
set -eu

cd /app

if [ "${SKIP_PRISMA_DB_PUSH:-0}" != "1" ]; then
  pnpm --filter @opencashier/api prisma:db:push
fi

exec node apps/api/dist/main.js
