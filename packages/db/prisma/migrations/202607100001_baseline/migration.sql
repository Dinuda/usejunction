-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'community',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teams" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "team_id" TEXT,
    "auth_user_id" TEXT,
    "role" TEXT NOT NULL DEFAULT 'developer',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "devices" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "hostname" TEXT NOT NULL,
    "os" TEXT NOT NULL,
    "architecture" TEXT NOT NULL,
    "agent_version" TEXT NOT NULL,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'online',
    "device_token" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tool_installations" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "tool_name" TEXT NOT NULL,
    "detected" BOOLEAN NOT NULL DEFAULT false,
    "configured" BOOLEAN NOT NULL DEFAULT false,
    "config_path" TEXT,
    "version" TEXT,
    "last_checked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tool_installations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "local_models" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model_name" TEXT NOT NULL,
    "size" TEXT,
    "running" BOOLEAN NOT NULL DEFAULT false,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "local_models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "request_metadata" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "user_id" TEXT,
    "device_id" TEXT,
    "tool_name" TEXT,
    "provider" TEXT,
    "model" TEXT,
    "input_tokens" INTEGER NOT NULL DEFAULT 0,
    "output_tokens" INTEGER NOT NULL DEFAULT 0,
    "total_tokens" INTEGER NOT NULL DEFAULT 0,
    "estimated_cost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "latency_ms" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'success',
    "trace_id" TEXT,
    "source" TEXT NOT NULL DEFAULT 'gateway',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "request_metadata_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enrollment_tokens" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "team_id" TEXT,
    "developer_id" TEXT,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "enrollment_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tool_accounts" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "tool_name" TEXT NOT NULL,
    "email" TEXT,
    "plan" TEXT,
    "login_method" TEXT NOT NULL DEFAULT 'unknown',
    "auth_present" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tool_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quota_snapshots" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "device_id" TEXT,
    "tool_name" TEXT NOT NULL,
    "window_type" TEXT NOT NULL,
    "used_percent" DOUBLE PRECISION,
    "reset_at" TIMESTAMP(3),
    "credits_remaining" DOUBLE PRECISION,
    "source" TEXT NOT NULL DEFAULT 'cli_rpc',
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quota_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "local_usage_aggregates" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "tool_name" TEXT NOT NULL,
    "model" TEXT NOT NULL DEFAULT '',
    "input_tokens" INTEGER NOT NULL DEFAULT 0,
    "output_tokens" INTEGER NOT NULL DEFAULT 0,
    "cache_read_tokens" INTEGER NOT NULL DEFAULT 0,
    "estimated_cost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL DEFAULT 'local_scan',

    CONSTRAINT "local_usage_aggregates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_users" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "passwordHash" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_accounts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_account_id" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "auth_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_sessions" (
    "id" TEXT NOT NULL,
    "session_token" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_verification_tokens" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "organization_memberships" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'developer',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_action_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_action_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_interests" (
    "id" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "company" TEXT,
    "message" TEXT,
    "status" TEXT NOT NULL DEFAULT 'new',
    "user_id" TEXT,
    "org_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plan_interests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_domains" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "verification_hash" TEXT NOT NULL,
    "verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_domains_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_invites" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'developer',
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "accepted_at" TIMESTAMP(3),
    "invited_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_connections" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "product" TEXT NOT NULL DEFAULT '',
    "method" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "external_org_id" TEXT,
    "credential_ciphertext" TEXT,
    "credential_fingerprint" TEXT,
    "credential_version" INTEGER NOT NULL DEFAULT 1,
    "config" JSONB,
    "permissions" JSONB,
    "last_synced_at" TIMESTAMP(3),
    "next_sync_at" TIMESTAMP(3),
    "lease_until" TIMESTAMP(3),
    "last_error" TEXT,
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_sync_runs" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "connection_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "cursor" TEXT,
    "counts" JSONB,
    "error" TEXT,

    CONSTRAINT "provider_sync_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_identities" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "developer_id" TEXT,
    "connection_id" TEXT,
    "provider" TEXT NOT NULL,
    "external_user_id" TEXT NOT NULL,
    "email" TEXT,
    "display_name" TEXT,
    "source" TEXT NOT NULL DEFAULT 'vendor_verified',
    "matched_by" TEXT,
    "observed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "external_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seat_assignments" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "connection_id" TEXT NOT NULL,
    "developer_id" TEXT,
    "external_user_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "product" TEXT NOT NULL,
    "plan" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "source" TEXT NOT NULL DEFAULT 'vendor_verified',
    "assigned_at" TIMESTAMP(3),
    "last_activity_at" TIMESTAMP(3),
    "observed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "seat_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "repositories" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "repositories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_daily" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "developer_id" TEXT,
    "device_id" TEXT,
    "connection_id" TEXT,
    "repository_id" TEXT,
    "date" DATE NOT NULL,
    "provider" TEXT NOT NULL,
    "product" TEXT NOT NULL DEFAULT '',
    "tool_name" TEXT NOT NULL DEFAULT '',
    "model" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL,
    "source_ref" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "requests" INTEGER NOT NULL DEFAULT 0,
    "sessions" INTEGER NOT NULL DEFAULT 0,
    "input_tokens" BIGINT NOT NULL DEFAULT 0,
    "output_tokens" BIGINT NOT NULL DEFAULT 0,
    "cache_read_tokens" BIGINT NOT NULL DEFAULT 0,
    "active_seconds" BIGINT NOT NULL DEFAULT 0,
    "suggested_lines" BIGINT NOT NULL DEFAULT 0,
    "accepted_lines" BIGINT NOT NULL DEFAULT 0,
    "added_lines" BIGINT NOT NULL DEFAULT 0,
    "deleted_lines" BIGINT NOT NULL DEFAULT 0,
    "commits" INTEGER NOT NULL DEFAULT 0,
    "pull_requests" INTEGER NOT NULL DEFAULT 0,
    "cost_micros" BIGINT NOT NULL DEFAULT 0,
    "dedupe_key" TEXT NOT NULL,
    "observed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "usage_daily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "developer_tool_claims" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "developer_id" TEXT NOT NULL,
    "tool_name" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'employee_reported',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "observed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "developer_tool_claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telemetry_endpoints" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "token_hint" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rotated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telemetry_endpoints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "actor_type" TEXT NOT NULL,
    "actor_id" TEXT,
    "action" TEXT NOT NULL,
    "target_type" TEXT,
    "target_id" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "users_auth_user_id_key" ON "users"("auth_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_org_id_email_key" ON "users"("org_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "devices_device_token_key" ON "devices"("device_token");

-- CreateIndex
CREATE UNIQUE INDEX "tool_installations_device_id_tool_name_key" ON "tool_installations"("device_id", "tool_name");

-- CreateIndex
CREATE UNIQUE INDEX "local_models_device_id_provider_model_name_key" ON "local_models"("device_id", "provider", "model_name");

-- CreateIndex
CREATE INDEX "request_metadata_org_id_created_at_idx" ON "request_metadata"("org_id", "created_at");

-- CreateIndex
CREATE INDEX "request_metadata_user_id_idx" ON "request_metadata"("user_id");

-- CreateIndex
CREATE INDEX "request_metadata_model_idx" ON "request_metadata"("model");

-- CreateIndex
CREATE INDEX "request_metadata_tool_name_idx" ON "request_metadata"("tool_name");

-- CreateIndex
CREATE UNIQUE INDEX "enrollment_tokens_token_hash_key" ON "enrollment_tokens"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "tool_accounts_device_id_tool_name_key" ON "tool_accounts"("device_id", "tool_name");

-- CreateIndex
CREATE INDEX "quota_snapshots_device_id_tool_name_window_type_idx" ON "quota_snapshots"("device_id", "tool_name", "window_type");

-- CreateIndex
CREATE INDEX "local_usage_aggregates_org_id_user_id_date_tool_name_idx" ON "local_usage_aggregates"("org_id", "user_id", "date", "tool_name");

-- CreateIndex
CREATE UNIQUE INDEX "local_usage_aggregates_device_id_date_tool_name_model_key" ON "local_usage_aggregates"("device_id", "date", "tool_name", "model");

-- CreateIndex
CREATE UNIQUE INDEX "auth_users_email_key" ON "auth_users"("email");

-- CreateIndex
CREATE INDEX "auth_accounts_user_id_idx" ON "auth_accounts"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "auth_accounts_provider_provider_account_id_key" ON "auth_accounts"("provider", "provider_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "auth_sessions_session_token_key" ON "auth_sessions"("session_token");

-- CreateIndex
CREATE UNIQUE INDEX "auth_verification_tokens_token_key" ON "auth_verification_tokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "auth_verification_tokens_identifier_token_key" ON "auth_verification_tokens"("identifier", "token");

-- CreateIndex
CREATE INDEX "organization_memberships_org_id_idx" ON "organization_memberships"("org_id");

-- CreateIndex
CREATE UNIQUE INDEX "organization_memberships_user_id_org_id_key" ON "organization_memberships"("user_id", "org_id");

-- CreateIndex
CREATE UNIQUE INDEX "auth_action_tokens_token_hash_key" ON "auth_action_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "auth_action_tokens_user_id_type_created_at_idx" ON "auth_action_tokens"("user_id", "type", "created_at");

-- CreateIndex
CREATE INDEX "plan_interests_email_plan_idx" ON "plan_interests"("email", "plan");

-- CreateIndex
CREATE UNIQUE INDEX "organization_domains_domain_key" ON "organization_domains"("domain");

-- CreateIndex
CREATE INDEX "organization_domains_org_id_idx" ON "organization_domains"("org_id");

-- CreateIndex
CREATE UNIQUE INDEX "organization_invites_token_hash_key" ON "organization_invites"("token_hash");

-- CreateIndex
CREATE INDEX "organization_invites_org_id_email_idx" ON "organization_invites"("org_id", "email");

-- CreateIndex
CREATE INDEX "provider_connections_status_next_sync_at_lease_until_idx" ON "provider_connections"("status", "next_sync_at", "lease_until");

-- CreateIndex
CREATE UNIQUE INDEX "provider_connections_org_id_provider_product_key" ON "provider_connections"("org_id", "provider", "product");

-- CreateIndex
CREATE INDEX "provider_sync_runs_connection_id_started_at_idx" ON "provider_sync_runs"("connection_id", "started_at");

-- CreateIndex
CREATE INDEX "external_identities_org_id_email_idx" ON "external_identities"("org_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "external_identities_org_id_provider_external_user_id_key" ON "external_identities"("org_id", "provider", "external_user_id");

-- CreateIndex
CREATE INDEX "seat_assignments_org_id_developer_id_idx" ON "seat_assignments"("org_id", "developer_id");

-- CreateIndex
CREATE UNIQUE INDEX "seat_assignments_connection_id_external_user_id_key" ON "seat_assignments"("connection_id", "external_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "repositories_org_id_host_owner_name_key" ON "repositories"("org_id", "host", "owner", "name");

-- CreateIndex
CREATE INDEX "usage_daily_org_id_date_source_idx" ON "usage_daily"("org_id", "date", "source");

-- CreateIndex
CREATE INDEX "usage_daily_org_id_developer_id_date_idx" ON "usage_daily"("org_id", "developer_id", "date");

-- CreateIndex
CREATE INDEX "usage_daily_org_id_repository_id_date_idx" ON "usage_daily"("org_id", "repository_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "usage_daily_org_id_dedupe_key_key" ON "usage_daily"("org_id", "dedupe_key");

-- CreateIndex
CREATE INDEX "developer_tool_claims_org_id_tool_name_idx" ON "developer_tool_claims"("org_id", "tool_name");

-- CreateIndex
CREATE UNIQUE INDEX "developer_tool_claims_developer_id_tool_name_source_key" ON "developer_tool_claims"("developer_id", "tool_name", "source");

-- CreateIndex
CREATE UNIQUE INDEX "telemetry_endpoints_org_id_key" ON "telemetry_endpoints"("org_id");

-- CreateIndex
CREATE UNIQUE INDEX "telemetry_endpoints_token_hash_key" ON "telemetry_endpoints"("token_hash");

-- CreateIndex
CREATE INDEX "audit_logs_org_id_created_at_idx" ON "audit_logs"("org_id", "created_at");

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_auth_user_id_fkey" FOREIGN KEY ("auth_user_id") REFERENCES "auth_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tool_installations" ADD CONSTRAINT "tool_installations_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tool_installations" ADD CONSTRAINT "tool_installations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tool_installations" ADD CONSTRAINT "tool_installations_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "local_models" ADD CONSTRAINT "local_models_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "local_models" ADD CONSTRAINT "local_models_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "local_models" ADD CONSTRAINT "local_models_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_metadata" ADD CONSTRAINT "request_metadata_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_metadata" ADD CONSTRAINT "request_metadata_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_metadata" ADD CONSTRAINT "request_metadata_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollment_tokens" ADD CONSTRAINT "enrollment_tokens_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollment_tokens" ADD CONSTRAINT "enrollment_tokens_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollment_tokens" ADD CONSTRAINT "enrollment_tokens_developer_id_fkey" FOREIGN KEY ("developer_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tool_accounts" ADD CONSTRAINT "tool_accounts_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tool_accounts" ADD CONSTRAINT "tool_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tool_accounts" ADD CONSTRAINT "tool_accounts_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quota_snapshots" ADD CONSTRAINT "quota_snapshots_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quota_snapshots" ADD CONSTRAINT "quota_snapshots_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "local_usage_aggregates" ADD CONSTRAINT "local_usage_aggregates_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "local_usage_aggregates" ADD CONSTRAINT "local_usage_aggregates_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "local_usage_aggregates" ADD CONSTRAINT "local_usage_aggregates_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_accounts" ADD CONSTRAINT "auth_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_action_tokens" ADD CONSTRAINT "auth_action_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_interests" ADD CONSTRAINT "plan_interests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_interests" ADD CONSTRAINT "plan_interests_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_domains" ADD CONSTRAINT "organization_domains_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_invites" ADD CONSTRAINT "organization_invites_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_connections" ADD CONSTRAINT "provider_connections_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_sync_runs" ADD CONSTRAINT "provider_sync_runs_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_sync_runs" ADD CONSTRAINT "provider_sync_runs_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "provider_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_identities" ADD CONSTRAINT "external_identities_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_identities" ADD CONSTRAINT "external_identities_developer_id_fkey" FOREIGN KEY ("developer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_identities" ADD CONSTRAINT "external_identities_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "provider_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seat_assignments" ADD CONSTRAINT "seat_assignments_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seat_assignments" ADD CONSTRAINT "seat_assignments_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "provider_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seat_assignments" ADD CONSTRAINT "seat_assignments_developer_id_fkey" FOREIGN KEY ("developer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repositories" ADD CONSTRAINT "repositories_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_daily" ADD CONSTRAINT "usage_daily_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_daily" ADD CONSTRAINT "usage_daily_developer_id_fkey" FOREIGN KEY ("developer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_daily" ADD CONSTRAINT "usage_daily_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_daily" ADD CONSTRAINT "usage_daily_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "provider_connections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_daily" ADD CONSTRAINT "usage_daily_repository_id_fkey" FOREIGN KEY ("repository_id") REFERENCES "repositories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "developer_tool_claims" ADD CONSTRAINT "developer_tool_claims_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "developer_tool_claims" ADD CONSTRAINT "developer_tool_claims_developer_id_fkey" FOREIGN KEY ("developer_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telemetry_endpoints" ADD CONSTRAINT "telemetry_endpoints_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
