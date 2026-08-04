"use client";

import Link from "next/link";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import { ToolLogoTile } from "@/components/tools/tool-brand-icon";
import { formatCompactNumber } from "@/lib/format";
import { toolDisplayName } from "@/lib/tools/catalog";

export type TopModelRow = {
  toolName: string;
  model: string;
  requests: number;
  tokens: number;
  cost: number;
};

function sharePercent(value: number, total: number) {
  if (total <= 0 || value <= 0) return 0;
  return Math.round((value / total) * 100);
}

export function TopModelsPanel({
  models,
  periodLabel,
  audience = "team",
}: {
  models: TopModelRow[];
  periodLabel?: string;
  audience?: "you" | "team";
}) {
  const totalRequests = models.reduce((sum, row) => sum + row.requests, 0);
  const audienceLabel = audience === "you" ? "you" : "team";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-3 flex min-w-0 shrink-0 items-baseline justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight">Top models.</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {periodLabel
              ? `Request volume · ${audienceLabel} · ${periodLabel}`
              : `Request volume by model across the ${audienceLabel}.`}
          </p>
        </div>
        <Link
          href={audience === "you" ? "/activity?scope=you" : "/activity"}
          className="shrink-0 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          Activity
        </Link>
      </div>
      {models.length ? (
        <div className="uj-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <ul>
            {models.map((row) => {
              const share = sharePercent(row.requests, totalRequests);
              return (
                <li
                  key={`${row.toolName}-${row.model}`}
                  className="flex items-start gap-3 border-b border-border/60 py-3 last:border-b-0"
                >
                  <ToolLogoTile tool={row.toolName} size="sm" light className="mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-mono text-sm font-medium">{row.model}</p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {toolDisplayName(row.toolName)}
                        </p>
                      </div>
                      <p className="shrink-0 text-sm font-medium tabular-nums">
                        {formatCompactNumber(row.requests)}
                      </p>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {share}% of requests
                      {row.tokens > 0 ? ` · ${formatCompactNumber(row.tokens)} tokens` : ""}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <Empty className="min-h-0 gap-1 border-0 p-4 md:p-4">
          <EmptyDescription>No model traffic yet.</EmptyDescription>
        </Empty>
      )}
    </div>
  );
}
