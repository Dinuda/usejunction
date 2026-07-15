#!/bin/sh
set -e

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${AUTH_SECRET:?AUTH_SECRET is required}"
: "${INGEST_SECRET:?INGEST_SECRET is required}"
: "${INGEST_ORG_ID:?INGEST_ORG_ID is required}"
: "${CRON_SECRET:?CRON_SECRET is required}"
: "${INTEGRATION_ENCRYPTION_KEY:?INTEGRATION_ENCRYPTION_KEY is required}"

case "$INGEST_SECRET" in
  change-me-ingest-secret) echo "Refusing to start with the default INGEST_SECRET" >&2; exit 1 ;;
esac
case "$CRON_SECRET" in
  development-cron) echo "Refusing to start with the default CRON_SECRET" >&2; exit 1 ;;
esac
case "$AUTH_SECRET" in
  change-me-in-production) echo "Refusing to start with the default AUTH_SECRET" >&2; exit 1 ;;
esac
if [ "${USEJUNCTION_ALLOW_INSECURE_DEVELOPMENT:-false}" = "true" ]; then
  echo "USEJUNCTION_ALLOW_INSECURE_DEVELOPMENT is not accepted by the production image" >&2
  exit 1
fi

PRISMA_DIR="/app/packages/db"
PRISMA_BIN="$PRISMA_DIR/node_modules/prisma/build/index.js"
SCHEMA="$PRISMA_DIR/prisma/schema.prisma"

echo "==> Applying Prisma migrations..."
if ! MIGRATION_OUTPUT="$(node "$PRISMA_BIN" migrate deploy --schema="$SCHEMA" 2>&1)"; then
  echo "$MIGRATION_OUTPUT"
  exit 1
else
  echo "$MIGRATION_OUTPUT"
fi

if [ "${SEED_DEMO_DATA:-false}" = "true" ]; then
  echo "SEED_DEMO_DATA is not accepted by the production image" >&2
  exit 1
fi

echo "==> Starting admin server..."
exec node apps/admin/server.js
