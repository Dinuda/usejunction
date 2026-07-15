import type { MetricWindow } from "@/lib/analytics/contracts/time-window";
import type { UsageKpis } from "@/lib/metrics/model-usage";

export type UsageDetailInput = {
  reportWindow: MetricWindow;
  developerId?: string;
};

export type UsageDetailV1 = {
  byModel: Array<{
    model: string | null;
    toolName: string;
    requests: number;
    tokens: number;
    cost: number;
    source: string;
    verified: boolean;
    costKind: string | null;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    reasoningTokens: number;
  }>;
  productivityModels: Array<{
    toolName: string;
    model: string;
    source: string;
    suggestedLines: number;
    acceptedLines: number;
    addedLines: number;
    deletedLines: number;
    commits: number;
  }>;
  byTool: Array<{ toolName: string | null; requests: number; tokens: number; cost: number }>;
  byDay: Array<{ date: string; requests: number; tokens: number; cost: number }>;
  kpis: UsageKpis;
};
