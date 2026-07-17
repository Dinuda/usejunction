export type DeviceActivityExtraction = {
  tools: Array<{
    toolName: string;
    version: string | null;
    detected: boolean;
    configured: boolean;
    lastCheckedAt: string;
  }>;
  accounts: Array<{
    toolName: string;
    email: string | null;
    plan: string | null;
    loginMethod: string;
    authPresent: boolean;
    updatedAt: string;
  }>;
  quotas: Array<{
    toolName: string;
    windowType: string;
    usedPercent: number | null;
    creditsRemaining: number | null;
    source: string;
    updatedAt: string;
  }>;
  usage: Array<{
    date: string;
    toolName: string;
    model: string;
    requests: number;
    inputTokens: number;
    outputTokens: number;
    estimatedCost: number;
    metricKind: string;
  }>;
};

export type DeviceActivityItem =
  | {
      id: string;
      kind: "heartbeat";
      at: string;
      device: {
        id: string;
        hostname: string;
        os: string;
        architecture: string;
        agentVersion: string;
        online: boolean;
      };
      developer: { id: string; name: string; email: string } | null;
    }
  | {
      id: string;
      kind: "sync";
      syncKind: "usage" | "accounts";
      at: string;
      device: {
        id: string;
        hostname: string;
        os: string;
        architecture: string;
        agentVersion: string;
        online: boolean;
      };
      developer: { id: string; name: string; email: string } | null;
      extraction: DeviceActivityExtraction;
    }
  | {
      id: string;
      kind: "agent_update";
      at: string;
      eventType: string;
      currentVersion: string | null;
      targetVersion: string;
      stage: string | null;
      errorCode: string | null;
      device: {
        id: string;
        hostname: string;
        os: string;
        architecture: string;
        agentVersion: string;
        online: boolean;
      };
      developer: { id: string; name: string; email: string } | null;
    };

export type DeviceActivityFeed = {
  items: DeviceActivityItem[];
};
