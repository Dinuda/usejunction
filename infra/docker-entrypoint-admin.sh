#!/bin/sh
set -e

export DATABASE_URL="${DATABASE_URL:-postgresql://usejunction:usejunction@postgres:5432/usejunction}"
: "${DEMO_ENROLLMENT_TOKEN:?DEMO_ENROLLMENT_TOKEN is required}"

PRISMA_DIR="/app/prisma-migrate"
PRISMA_BIN="$PRISMA_DIR/node_modules/prisma/build/index.js"
SCHEMA="$PRISMA_DIR/prisma/schema.prisma"

echo "==> Applying Prisma migrations..."
if ! MIGRATION_OUTPUT="$(node "$PRISMA_BIN" migrate deploy --schema="$SCHEMA" 2>&1)"; then
  echo "$MIGRATION_OUTPUT"
  if echo "$MIGRATION_OUTPUT" | grep -q "P3005"; then
    echo "==> Adopting legacy db-push database into migration history..."
    node "$PRISMA_BIN" db push --schema="$SCHEMA" --skip-generate
    node "$PRISMA_BIN" migrate resolve --schema="$SCHEMA" --applied 202607100001_baseline
  else
    exit 1
  fi
else
  echo "$MIGRATION_OUTPUT"
fi

if [ "${SEED_DEMO_DATA:-false}" = "true" ]; then
  echo "==> Seeding demo database..."
  cd "$PRISMA_DIR"
  ./node_modules/.bin/tsx prisma/seed.ts
  cd /app
fi

echo "==> Starting admin server..."
exec node apps/admin/server.js
