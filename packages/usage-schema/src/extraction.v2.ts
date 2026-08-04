/**
 * Junction Extraction Contract v2.
 *
 * OTLP/HTTP metrics are one input to this contract.  Provider administration
 * APIs also expose seats, invoices, limits and product analytics which do not
 * have a portable OTel representation, so those are explicit record kinds.
 * The contract is deliberately content-free: prompts, source code, tool
 * arguments/results and file paths are never part of a valid source envelope.
 */

export const JUNCTION_EXTRACTION_SCHEMA_VERSION = "2.0.0" as const;

export type ExtractionRecordKind =
  | "identity"
  | "seat"
  | "measurement"
  | "capability";

export type ExtractionEvidence =
  | "vendor_verified"
  | "otel_observed"
  | "device_observed"
  | "gateway_observed"
  | "invoice_imported"
  | "estimated";

export type MeasurementTemporality = "delta" | "cumulative" | "gauge";

export type ExtractionCostKind =
  | "actual_spend"
  | "subscription_committed"
  | "vendor_reported"
  | "included_usage"
  | "overage"
  | "estimated_api";

export type ExtractionSource = {
  provider: string;
  product: string;
  tenantId?: string | null;
  connectionId?: string | null;
  endpoint: string;
  capability: string;
  evidence: ExtractionEvidence;
  schemaVersion: string;
  fetchedAt: string;
};

export type ExtractionSubject = {
  externalUserId?: string | null;
  userEmail?: string | null;
  workspaceId?: string | null;
  projectId?: string | null;
  apiKeyId?: string | null;
  repository?: { host: string; owner: string; name: string } | null;
};

export type ExtractionMeasurement = {
  schemaVersion: typeof JUNCTION_EXTRACTION_SCHEMA_VERSION;
  kind: "measurement";
  source: ExtractionSource;
  subject: ExtractionSubject;
  metric: string;
  value: number;
  unit: string;
  temporality: MeasurementTemporality;
  occurredAt: string;
  bucketStart?: string;
  bucketEnd?: string;
  model?: string | null;
  surface?: string | null;
  metricKind?: "usage" | "productivity";
  costKind?: ExtractionCostKind | null;
  attributes?: Record<string, string | number | boolean | null>;
  sourceRecordId?: string | null;
  fingerprint: string;
};

export type ExtractionIdentity = {
  schemaVersion: typeof JUNCTION_EXTRACTION_SCHEMA_VERSION;
  kind: "identity";
  source: ExtractionSource;
  externalUserId: string;
  email?: string | null;
  displayName?: string | null;
  role?: string | null;
  observedAt: string;
  fingerprint: string;
};

export type ExtractionSeat = {
  schemaVersion: typeof JUNCTION_EXTRACTION_SCHEMA_VERSION;
  kind: "seat";
  source: ExtractionSource;
  externalUserId: string;
  product: string;
  plan?: string | null;
  status: string;
  assignedAt?: string | null;
  lastActivityAt?: string | null;
  observedAt: string;
  fingerprint: string;
};

export type ExtractionCapability = {
  schemaVersion: typeof JUNCTION_EXTRACTION_SCHEMA_VERSION;
  kind: "capability";
  source: ExtractionSource;
  status: "available" | "forbidden" | "unsupported" | "degraded";
  dataThrough?: string | null;
  permission?: string | null;
  errorCode?: string | null;
  observedAt: string;
  fingerprint: string;
};

export type SanitizedSourceEnvelope = {
  schemaVersion: typeof JUNCTION_EXTRACTION_SCHEMA_VERSION;
  source: ExtractionSource;
  recordKind: ExtractionRecordKind;
  externalRecordId?: string | null;
  occurredAt?: string | null;
  payload: Record<string, unknown>;
  fingerprint: string;
  expiresAt: string;
};

const SAFE_KEYS = new Set([
  "organization.id", "user.id", "user.account_id", "user.account_uuid", "user.email",
  "workspace_id", "project_id", "api_key_id", "model", "surface", "type", "kind",
  "date", "starting_at", "ending_at", "timestamp", "repository", "repo_name",
  "branch_name", "is_primary_branch", "client_version", "is_headless", "usage_kind",
  "requests", "sessions", "threads", "turns", "input_tokens", "output_tokens",
  "cache_read_tokens", "cache_write_tokens", "reasoning_tokens", "cost_micros",
  "cost_cents", "amount", "currency", "lines_added", "lines_deleted", "accepted_lines",
  "suggested_lines", "commits", "pull_requests", "active_seconds", "included_usage",
  "overage_cost", "status", "plan", "role", "name", "is_active",
  "active", "tabsShown", "tabsAccepted", "fastPremiumRequests", "currentSubscriptionCycle",
  "eventId", "costType", "description", "lineItem", "projectName", "lastUsedAt", "expiresAt", "editor",
  "sourceEndpoint", "sourceCapability", "evidence", "metricName",
]);

/** Drop unknown and content-bearing fields before a source payload is stored. */
export function sanitizeExtractionPayload(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (!SAFE_KEYS.has(key)) continue;
    if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      output[key] = value;
      continue;
    }
    if (key === "repository" && value && typeof value === "object" && !Array.isArray(value)) {
      const repo = value as Record<string, unknown>;
      output[key] = {
        host: typeof repo.host === "string" ? repo.host : "",
        owner: typeof repo.owner === "string" ? repo.owner : "",
        name: typeof repo.name === "string" ? repo.name : "",
      };
    }
  }
  return output;
}

export function extractionFingerprint(input: {
  source: Pick<ExtractionSource, "provider" | "product" | "tenantId" | "endpoint" | "capability">;
  externalRecordId?: string | null;
  subject?: ExtractionSubject;
  metric?: string;
  occurredAt?: string;
  value?: number;
  payload?: unknown;
}): string {
  const payload = sanitizeExtractionPayload(input.payload);
  return stableDigest(JSON.stringify({
    source: input.source,
    externalRecordId: input.externalRecordId ?? null,
    subject: input.subject ?? {},
    metric: input.metric ?? null,
    occurredAt: input.occurredAt ?? null,
    value: input.value ?? null,
    payload,
  }));
}

function stableDigest(value: string): string {
  // A deterministic, dependency-free fingerprint for wire contracts.  The
  // server may replace this with SHA-256 when persisting a dedupe key.
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
