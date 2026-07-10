#!/bin/sh
set -e

export DATABASE_URL="${DATABASE_URL:-postgresql://usejunction:usejunction@postgres:5432/usejunction}"
PRISMA_BIN="prisma-migrate/node_modules/prisma/build/index.js"
SCHEMA="prisma-migrate/prisma/schema.prisma"

echo "==> Running Prisma db push..."
node "$PRISMA_BIN" db push --schema="$SCHEMA"

echo "==> Seeding database..."
node "$PRISMA_BIN" db seed --schema="$SCHEMA"

echo "==> Starting admin server..."
exec node apps/admin/server.js
