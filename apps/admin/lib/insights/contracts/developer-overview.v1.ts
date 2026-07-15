import type { MetricWindow } from "@/lib/analytics/contracts/time-window";
import type { OrganizationRole } from "@/lib/workspace-context";

export type DeveloperOverviewInput = {
  reportWindow: MetricWindow;
  developerId: string;
  /** Role to stamp on the response (caller’s view of this developer). */
  role?: OrganizationRole;
};

export type DeveloperOverviewV1 = {
  developer: {
    id: string;
    name: string;
    email: string;
    role: OrganizationRole;
    organization: { name: string; slug: string };
    devices: Array<{
      id: string;
      hostname: string;
      os: string;
      architecture: string;
      agentVersion: string;
      status: string;
      lastSeenAt: Date;
      lastUsageSyncAt: Date | null;
      lastAccountSyncAt: Date | null;
      localEndpoint: string | null;
      tools: Array<{ toolName: string; version: string | null; lastCheckedAt: Date | null }>;
      accounts: Array<{
        toolName: string;
        email: string | null;
        plan: string | null;
        authPresent: boolean;
        updatedAt: Date;
      }>;
      quotas: Array<{
        toolName: string;
        windowType: string;
        usedPercent: number | null;
        resetAt: Date | null;
        updatedAt: Date;
      }>;
    }>;
    assignedPlans: Array<{
      provider: string;
      product: string;
      plan: string | null;
      status: string;
      source: string;
      lastActivityAt: Date | null;
      observedAt: Date;
    }>;
    manualPlans: Array<{
      id: string;
      toolName: string;
      planName: string;
      planTier: string | null;
      currency: string;
      monthlySeatMicros: bigint;
      includedMonthlyMicros: bigint;
      seatCount: number;
      seatStatus: string;
      startDate: Date;
      endDate: Date | null;
      active: boolean;
    }>;
    reportedTools: Array<{ toolName: string; source: string; observedAt: Date }>;
  };
  usage: {
    requests: number;
    sessions: number;
    inputTokens: string;
    outputTokens: string;
    costMicros: string;
  };
  toolsUsage: Array<{
    toolName: string;
    requests: number;
    tokens: number;
    cost: number;
  }>;
  aiCoding: {
    requests: number;
    suggestedLines: number;
    acceptedLines: number;
    addedLines: number;
    deletedLines: number;
    commits: number;
    aiPercent: number | null;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    reasoningTokens: number;
    cost: number;
    verifiedCost: number;
  };
  modelUsage: Array<{
    toolName: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    reasoningTokens: number;
    cost: number;
    requests: number;
    suggestedLines: number;
    acceptedLines: number;
    source: string;
    verified: boolean;
    costKind: string | null;
    metricKind: "usage" | "productivity";
  }>;
  sync: {
    lastSeenAt: string | null;
    lastUsageSyncAt: string | null;
    lastAccountSyncAt: string | null;
    stale: boolean;
    hasLocalEndpoint: boolean;
    needsPlanSync: boolean;
  };
};
