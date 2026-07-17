/** Productivity inventory rows from Codex/Work local scans keep call counts in requests. */
export function shouldPreserveProductivityRequests(metricKind: string, model: string): boolean {
  return (
    metricKind === "productivity" &&
    (model.startsWith("tool:") || model.startsWith("flow:"))
  );
}
