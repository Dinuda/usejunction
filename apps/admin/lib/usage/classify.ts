/**
 * Server-authoritative classification for UseJunction Usage Schema v1.
 * Agents emit raw facts; this module owns provider / source / metric / cost kinds
 * so classification can change without redeploying agents.
 */
import type { UusCostKind, UusMetricKind, UusV1Record } from "@usejunction/usage-schema";
import { shouldPreserveProductivityRequests } from "@/lib/metrics/local-usage-inventory";

export function providerForTool(toolName: string): string {
  if (toolName === "claude") return "anthropic";
  if (toolName === "codex" || toolName === "codex-work") return "openai";
  if (toolName === "copilot") return "github";
  if (toolName === "antigravity") return "google";
  return toolName;
}

/** Normalize legacy / tool-specific source aliases to canonical sources. */
export function normalizeCanonicalSource(source: string): string {
  if (
    source === "local_scan" ||
    source === "cursor_local" ||
    source === "antigravity_local" ||
    source === "antigravity_usage"
  ) {
    return "device_observed";
  }
  if (source === "cursor_usage_events") return "vendor_verified";
  return source;
}

export function inferMetricKind(
  row: {
    metricKind?: string;
    suggestedLines?: number;
    acceptedLines?: number;
    addedLines?: number;
    commits?: number;
    inputTokens?: number;
    outputTokens?: number;
  },
  source: string,
): UusMetricKind {
  if (row.metricKind === "productivity" || row.metricKind === "usage") return row.metricKind;
  if (source === "cursor_local") return "productivity";
  if (
    (row.suggestedLines ?? 0) + (row.acceptedLines ?? 0) + (row.addedLines ?? 0) + (row.commits ?? 0) > 0 &&
    (row.inputTokens ?? 0) + (row.outputTokens ?? 0) === 0
  ) {
    return "productivity";
  }
  return "usage";
}

export function inferCostKind(
  row: { costKind?: string; verified?: boolean },
  source: string,
  estimatedCost: number,
): UusCostKind | null {
  if (
    row.costKind === "verified_usage" ||
    row.costKind === "estimated_api" ||
    row.costKind === "actual_spend"
  ) {
    return row.costKind;
  }
  if (estimatedCost <= 0) return null;
  if (row.verified || source === "cursor_usage_events" || normalizeCanonicalSource(source) === "vendor_verified") {
    return "verified_usage";
  }
  if (source === "invoice_imported") return "actual_spend";
  return "estimated_api";
}

/** Classify a normalized UUS record into server canonical fields. */
export function classifyUusRecord(row: UusV1Record): {
  provider: string;
  canonicalSource: string;
  metricKind: UusMetricKind;
  costKind: UusCostKind | null;
  estimatedCostUsd: number;
  costMicros: number;
  requests: number;
} {
  const source = row.source || "local_scan";
  const provider = row["gen_ai.system"] || providerForTool(row.tool);
  const canonicalSource = normalizeCanonicalSource(source);
  const inputTokens = row.inputTokens ?? row["gen_ai.usage.input_tokens"] ?? 0;
  const outputTokens = row.outputTokens ?? row["gen_ai.usage.output_tokens"] ?? 0;
  const metricKind = inferMetricKind(
    {
      metricKind: row.metricKind,
      suggestedLines: row.suggestedLines,
      acceptedLines: row.acceptedLines,
      addedLines: row.addedLines,
      commits: row.commits,
      inputTokens,
      outputTokens,
    },
    source,
  );
  const estimatedCostUsd =
    row.cost?.amountUsd ??
    (typeof row.cost?.amountMicros === "number" ? row.cost.amountMicros / 1_000_000 : undefined) ??
    row.estimatedCost ??
    0;
  const costKind = inferCostKind(
    { costKind: row.costKind ?? row.cost?.kind, verified: row.verified },
    source,
    estimatedCostUsd,
  );
  const requests =
    metricKind === "productivity" && !shouldPreserveProductivityRequests(metricKind, row.model ?? "")
      ? 0
      : Math.max(0, row.requests ?? 0);

  return {
    provider,
    canonicalSource,
    metricKind,
    costKind,
    estimatedCostUsd,
    costMicros: Math.max(0, Math.round(estimatedCostUsd * 1_000_000)),
    requests,
  };
}
