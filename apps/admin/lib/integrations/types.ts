export type ConnectionMethod =
  | "oauth"
  | "admin_api_key"
  | "service_account"
  | "otel"
  | "gateway"
  | "invoice_import"
  | "admin_confirmed"
  | "device_observed";

export type EvidenceSource =
  | "vendor_verified"
  | "otel_observed"
  | "gateway_observed"
  | "device_observed"
  | "invoice_imported"
  | "admin_confirmed"
  | "employee_reported"
  | "estimated";

export type IntegrationConfig = Record<string, string | number | boolean | null>;

export type ProviderMember = {
  externalUserId: string;
  email?: string | null;
  name?: string | null;
  role?: string | null;
  metadata?: Record<string, unknown>;
};

export type ProviderSeat = {
  externalUserId: string;
  product: string;
  plan?: string | null;
  status?: string;
  assignedAt?: Date | null;
  lastActivityAt?: Date | null;
  metadata?: Record<string, unknown>;
};

export type ProviderApiKey = {
  externalKeyId: string;
  name?: string | null;
  redactedHint?: string | null;
  projectId?: string | null;
  workspaceId?: string | null;
  ownerExternalId?: string | null;
  ownerEmail?: string | null;
  principalType?: string | null;
  status?: string;
  metadata?: Record<string, unknown>;
};

export type ProviderUsage = {
  externalKey: string;
  externalUserId?: string | null;
  externalApiKeyId?: string | null;
  externalProjectId?: string | null;
  externalWorkspaceId?: string | null;
  email?: string | null;
  date: Date;
  provider: string;
  product: string;
  toolName?: string;
  model?: string;
  requests?: number;
  sessions?: number;
  inputTokens?: bigint;
  outputTokens?: bigint;
  cacheReadTokens?: bigint;
  cacheWriteTokens?: bigint;
  activeSeconds?: bigint;
  suggestedLines?: bigint;
  acceptedLines?: bigint;
  addedLines?: bigint;
  deletedLines?: bigint;
  commits?: number;
  pullRequests?: number;
  costMicros?: bigint;
  metadata?: Record<string, unknown>;
};

export type ProviderSyncData = {
  externalOrgId?: string | null;
  permissions?: string[];
  members: ProviderMember[];
  seats: ProviderSeat[];
  apiKeys?: ProviderApiKey[];
  usage: ProviderUsage[];
  costSyncSucceeded?: boolean;
  costDataThrough?: Date | null;
};

export type AdapterContext = {
  credential: string;
  config: IntegrationConfig;
  initialSync: boolean;
  now: Date;
};

export interface ProviderAdapter {
  provider: string;
  products: string[];
  validate(context: AdapterContext): Promise<{ externalOrgId?: string; permissions?: string[] }>;
  sync(context: AdapterContext): Promise<ProviderSyncData>;
}
