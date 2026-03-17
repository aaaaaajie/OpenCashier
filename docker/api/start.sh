#!/bin/sh
set -eu

cd /app

if [ "${SKIP_PRISMA_DB_PUSH:-0}" != "1" ]; then
  ./node_modules/.bin/prisma db push --schema prisma/schema.prisma
fi

exec node dist/main.js
