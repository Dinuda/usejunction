import type { MetricWindow } from "@/lib/analytics/contracts/time-window";

export type ToolActivityInput = {
  reportWindow: MetricWindow;
};

export type ToolActivityV1 = {
  tools: Array<{
    toolName: string;
    installedOn: number;
    configuredOn: number;
    evidence: Array<{ source: string; developers: number }>;
    requests: number;
    cost: number;
    tokens: number;
    quotas: Array<{
      toolName: string;
      windowType: string;
      usedPercent: number | null;
      resetAt: Date | null;
      deviceHostname: string | null;
      developerName: string | null;
    }>;
  }>;
};
