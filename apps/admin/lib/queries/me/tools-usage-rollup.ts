import { canonicalToolKey, findCatalogTool } from "@/lib/tools/catalog";

export type PersonalToolUsageRow = {
  toolName: string;
  requests: number;
  tokens: number;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  cost: number;
};

type RolledUpPersonalToolUsageRow = Required<PersonalToolUsageRow>;

/** Prefer catalog `toolName` so aliases like codex / codex-work collapse to one stable label. */
function preferredToolName(rawName: string) {
  const key = canonicalToolKey(rawName);
  return findCatalogTool(key)?.toolName ?? rawName;
}

/**
 * Roll up period usage + detected installs by canonical tool key.
 * Usage rows may still carry legacy aliases (`codex`, `codex-work`) that share one catalog tool.
 */
export function rollupPersonalToolsUsage(
  usageRows: Array<PersonalToolUsageRow>,
  detectedToolNames: Iterable<string>,
): RolledUpPersonalToolUsageRow[] {
  const byKey = new Map<string, RolledUpPersonalToolUsageRow>();

  for (const row of usageRows) {
    const key = canonicalToolKey(row.toolName) || row.toolName || "unknown";
    const inputTokens = row.inputTokens ?? row.tokens;
    const outputTokens = row.outputTokens ?? 0;
    const cacheReadTokens = row.cacheReadTokens ?? 0;
    const cacheWriteTokens = row.cacheWriteTokens ?? 0;
    const existing = byKey.get(key);
    if (existing) {
      existing.requests += row.requests;
      existing.tokens += row.tokens;
      existing.inputTokens += inputTokens;
      existing.outputTokens += outputTokens;
      existing.cacheReadTokens += cacheReadTokens;
      existing.cacheWriteTokens += cacheWriteTokens;
      existing.cost += row.cost;
      continue;
    }
    byKey.set(key, {
      toolName: preferredToolName(row.toolName || "unknown"),
      requests: row.requests,
      tokens: row.tokens,
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheWriteTokens,
      cost: row.cost,
    });
  }

  for (const name of detectedToolNames) {
    const key = canonicalToolKey(name) || name;
    if (byKey.has(key)) continue;
    byKey.set(key, {
      toolName: preferredToolName(name),
      requests: 0,
      tokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      cost: 0,
    });
  }

  return Array.from(byKey.values()).sort(
    (a, b) => b.requests - a.requests || a.toolName.localeCompare(b.toolName),
  );
}
