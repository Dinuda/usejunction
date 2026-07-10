#!/bin/sh
set -e

export DATABASE_URL="${DATABASE_URL:-postgresql://usejunction:usejunction@postgres:5432/usejunction}"
export DEMO_ENROLLMENT_TOKEN="${DEMO_ENROLLMENT_TOKEN:-uj_enroll_demo_token_change_me}"

PRISMA_DIR="/app/prisma-migrate"
PRISMA_BIN="$PRISMA_DIR/node_modules/prisma/build/index.js"
SCHEMA="$PRISMA_DIR/prisma/schema.prisma"

echo "==> Running Prisma db push..."
node "$PRISMA_BIN" db push --schema="$SCHEMA" --skip-generate

echo "==> Seeding database..."
cd "$PRISMA_DIR"
./node_modules/.bin/tsx prisma/seed.ts
cd /app

echo "==> Starting admin server..."
exec node apps/admin/server.js
