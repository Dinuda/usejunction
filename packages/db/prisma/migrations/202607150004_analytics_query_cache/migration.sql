CREATE TABLE "analytics_query_cache" (
    "key" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "scope_hash" TEXT NOT NULL,
    "contract_version" TEXT NOT NULL,
    "calculation_version" TEXT NOT NULL,
    "normalized_query" JSONB NOT NULL,
    "result" JSONB NOT NULL,
    "generated_at" TIMESTAMP(3) NOT NULL,
    "data_through" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "analytics_query_cache_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "analytics_query_cache_org_id_expires_at_idx"
ON "analytics_query_cache"("org_id", "expires_at");

CREATE INDEX "analytics_query_cache_expires_at_idx"
ON "analytics_query_cache"("expires_at");

ALTER TABLE "analytics_query_cache"
ADD CONSTRAINT "analytics_query_cache_org_id_fkey"
FOREIGN KEY ("org_id") REFERENCES "organizations"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
