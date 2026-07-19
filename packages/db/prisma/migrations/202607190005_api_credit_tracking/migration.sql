ALTER TABLE "provider_connections"
ADD COLUMN "last_cost_synced_at" TIMESTAMP(3),
ADD COLUMN "cost_data_through" TIMESTAMP(3);

CREATE TABLE "api_credit_pools" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "connection_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "product" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'recurring',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "budget_micros" BIGINT NOT NULL,
    "billing_cadence" TEXT,
    "billing_cycle_anchor_date" DATE,
    "billing_cycle_days" INTEGER,
    "grant_start_date" DATE,
    "expires_at" DATE,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "api_credit_pools_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "provider_api_keys" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "connection_id" TEXT NOT NULL,
    "developer_id" TEXT,
    "external_key_id" TEXT NOT NULL,
    "name" TEXT,
    "redacted_hint" TEXT,
    "project_id" TEXT,
    "workspace_id" TEXT,
    "owner_external_id" TEXT,
    "owner_email" TEXT,
    "principal_type" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "mapping_source" TEXT,
    "metadata" JSONB,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "provider_api_keys_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "api_credit_pools_connection_id_key" ON "api_credit_pools"("connection_id");
CREATE INDEX "api_credit_pools_org_id_active_idx" ON "api_credit_pools"("org_id", "active");
CREATE INDEX "api_credit_pools_org_id_provider_product_idx" ON "api_credit_pools"("org_id", "provider", "product");
CREATE UNIQUE INDEX "provider_api_keys_connection_id_external_key_id_key" ON "provider_api_keys"("connection_id", "external_key_id");
CREATE INDEX "provider_api_keys_org_id_external_key_id_idx" ON "provider_api_keys"("org_id", "external_key_id");
CREATE INDEX "provider_api_keys_org_id_developer_id_idx" ON "provider_api_keys"("org_id", "developer_id");
CREATE INDEX "provider_api_keys_org_id_status_idx" ON "provider_api_keys"("org_id", "status");

ALTER TABLE "api_credit_pools" ADD CONSTRAINT "api_credit_pools_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "api_credit_pools" ADD CONSTRAINT "api_credit_pools_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "provider_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "provider_api_keys" ADD CONSTRAINT "provider_api_keys_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "provider_api_keys" ADD CONSTRAINT "provider_api_keys_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "provider_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "provider_api_keys" ADD CONSTRAINT "provider_api_keys_developer_id_fkey" FOREIGN KEY ("developer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
