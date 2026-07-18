"use client";

import { ToolLogoTile } from "@/components/tools/tool-brand-icon";
import { toolDisplayName } from "@/lib/tools/catalog";
import { ScrollFadeList } from "./scroll-fade-list";

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value < 1 ? 3 : 2,
  }).format(value);
}

function compact(value: number) {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

export type UsageBreakdownRow = {
  key: string;
  toolName: string | null | undefined;
  /** When set, primary label is the model (mono); tool becomes subtitle. */
  model?: string | null;
  requests: number;
  cost: number;
  /** Extra muted meta after requests, e.g. token count. */
  metaExtra?: string | null;
};

type UsageBreakdownListProps = {
  rows: UsageBreakdownRow[];
  /** What the right-side value shows. Defaults to cost. */
  valueMode?: "cost" | "requests";
  empty: string;
  countNoun?: string;
};

function sharePercent(value: number, total: number) {
  if (total <= 0 || value <= 0) return 0;
  return Math.round((value / total) * 100);
}

export function UsageBreakdownList({
  rows,
  valueMode = "cost",
  empty,
  countNoun = "items",
}: UsageBreakdownListProps) {
  if (!rows.length) {
    return <p className="py-6 text-sm text-muted-foreground">{empty}</p>;
  }

  const totalCost = rows.reduce((sum, row) => sum + row.cost, 0);
  const totalRequests = rows.reduce((sum, row) => sum + row.requests, 0);
  const useCostShare = valueMode === "cost" && totalCost > 0;
  const shareTotal = useCostShare ? totalCost : totalRequests;

  return (
    <ScrollFadeList
      countLabel={
        rows.length === 1 ? `Showing 1 ${countNoun.replace(/s$/, "")}` : `Showing all ${rows.length} ${countNoun}`
      }
    >
      <ul>
        {rows.map((row) => {
          const shareValue = useCostShare ? row.cost : row.requests;
          const share = sharePercent(shareValue, shareTotal);
          const toolKey = row.toolName ?? "unknown";
          const isModelRow = row.model != null;

          return (
            <li
              key={row.key}
              className="flex items-start gap-3 border-b border-border/60 px-3 py-4 last:border-b-0 transition-colors hover:bg-muted/30"
            >
              <ToolLogoTile tool={toolKey} size="sm" light className="mt-0.5" />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <div className="min-w-0">
                    {isModelRow ? (
                      <>
                        <p className="truncate font-mono text-sm font-medium">{row.model || "Unknown"}</p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {toolDisplayName(toolKey)}
                        </p>
                      </>
                    ) : (
                      <p className="truncate text-sm font-medium">{toolDisplayName(toolKey)}</p>
                    )}
                  </div>
                  <p className="shrink-0 text-sm font-medium tabular-nums">
                    {valueMode === "requests" ? compact(row.requests) : money(row.cost)}
                  </p>
                </div>
                <div className="mt-1.5 h-1.5 w-full bg-muted">
                  <div
                    className="h-full bg-primary/80"
                    style={{ width: `${Math.max(Math.min(share, 100), 0)}%` }}
                  />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {valueMode === "requests"
                    ? `${share}% of requests`
                    : `${row.requests.toLocaleString()} ${row.requests === 1 ? "request" : "requests"}`}
                  {row.metaExtra ? ` · ${row.metaExtra}` : ""}
                  {valueMode === "cost" && shareTotal > 0 ? ` · ${share}%` : ""}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </ScrollFadeList>
  );
}
