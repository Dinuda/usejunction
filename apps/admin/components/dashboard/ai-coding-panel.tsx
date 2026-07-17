"use client";

import { useMemo, useState } from "react";
import { TokenBreakdownChart } from "@/components/dashboard/token-breakdown-chart";
import { SignalsKpi, SignalsSectionHeader } from "@/components/signals/signals-ui";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { AiCodingMetrics, ModelUsageRow } from "@/lib/queries/me/overview";

const PAGE_SIZE = 25;

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

function pct(value: number | null) {
  if (value == null || Number.isNaN(value)) return "—";
  return `${Math.round(value)}%`;
}

function CostBadge({ row }: { row: ModelUsageRow }) {
  if (row.metricKind === "productivity") {
    return <Badge variant="outline" className="rounded-none">Productivity</Badge>;
  }
  if (row.costKind === "verified_usage" || row.verified) {
    return <Badge variant="default" className="rounded-none">Verified</Badge>;
  }
  if (row.costKind === "estimated_api") {
    return <Badge variant="secondary" className="rounded-none">Estimated</Badge>;
  }
  return <Badge variant="outline" className="rounded-none">{row.source}</Badge>;
}

function ModelTable({ title, description, rows }: { title: string; description: string; rows: ModelUsageRow[] }) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (row) =>
        row.model.toLowerCase().includes(q) ||
        row.toolName.toLowerCase().includes(q) ||
        row.source.toLowerCase().includes(q),
    );
  }, [query, rows]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  return (
    <div className="mt-8">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium">{title}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        </div>
        <Input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setPage(0);
          }}
          placeholder="Search models…"
          className="h-8 w-full max-w-xs rounded-none text-sm"
        />
      </div>
      {filtered.length ? (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-border/70 text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground">
                <tr>
                  <th className="pb-3 pr-4 pt-1 font-medium">Tool</th>
                  <th className="pb-3 pr-4 pt-1 font-medium">Model</th>
                  <th className="pb-3 pr-4 pt-1 text-right font-medium">Calls</th>
                  <th className="pb-3 pr-4 pt-1 text-right font-medium">In</th>
                  <th className="pb-3 pr-4 pt-1 text-right font-medium">Out</th>
                  <th className="pb-3 pr-4 pt-1 text-right font-medium">Cache</th>
                  <th className="pb-3 pr-4 pt-1 text-right font-medium">Cost</th>
                  <th className="pb-3 pt-1 font-medium">Kind</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row) => (
                  <tr
                    key={`${row.toolName}-${row.model}-${row.source}-${row.metricKind}`}
                    className="transition-colors hover:bg-muted/30"
                  >
                    <td className="py-5 pr-4 font-medium">{row.toolName}</td>
                    <td className="max-w-[220px] truncate py-5 pr-4 font-mono text-xs">{row.model}</td>
                    <td className="py-5 pr-4 text-right tabular-nums">{compact(row.requests)}</td>
                    <td className="py-5 pr-4 text-right tabular-nums">{compact(row.inputTokens)}</td>
                    <td className="py-5 pr-4 text-right tabular-nums">{compact(row.outputTokens)}</td>
                    <td className="py-5 pr-4 text-right tabular-nums">
                      {compact(row.cacheReadTokens + row.cacheWriteTokens)}
                    </td>
                    <td className="py-5 pr-4 text-right tabular-nums">{money(row.cost)}</td>
                    <td className="py-5">
                      <CostBadge row={row} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                className="underline-offset-4 hover:underline disabled:opacity-40"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                Previous
              </button>
              <button
                type="button"
                className="underline-offset-4 hover:underline disabled:opacity-40"
                disabled={page + 1 >= pageCount}
                onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              >
                Next
              </button>
            </div>
          </div>
        </>
      ) : (
        <p className="py-4 text-sm text-muted-foreground">No models match your search.</p>
      )}
    </div>
  );
}

export function AiCodingPanel({
  metrics,
  models,
  embedded = false,
}: {
  metrics: AiCodingMetrics;
  models: ModelUsageRow[];
  embedded?: boolean;
}) {
  const acceptance =
    metrics.suggestedLines > 0 ? (metrics.acceptedLines / metrics.suggestedLines) * 100 : null;
  const usageModels = models.filter((row) => row.metricKind !== "productivity");
  const productivityModels = models.filter((row) => row.metricKind === "productivity");

  return (
    <section className={cn(!embedded && "mt-10 border bg-card p-5")}>
      <SignalsSectionHeader
        title="AI coding."
        description="Verified vendor charges and estimated API-equivalent values are shown separately. Prompt text is never collected."
        bordered={false}
      />

      <div className="mb-8 grid gap-y-8 sm:grid-cols-2 xl:grid-cols-5">
        <SignalsKpi
          label="AI lines accepted"
          className="pl-5"
          value={compact(metrics.acceptedLines)}
          sub={
            metrics.suggestedLines > 0
              ? `${compact(metrics.suggestedLines)} suggested · ${pct(acceptance)} accept`
              : undefined
          }
        />
        <SignalsKpi
          label="AI-driven commits"
          className="sm:border-l sm:border-border sm:pl-8"
          value={metrics.aiPercent != null ? pct(metrics.aiPercent) : compact(metrics.commits)}
          sub={metrics.commits > 0 ? `${metrics.commits} scored commits` : "from Cursor tracking"}
        />
        <SignalsKpi
          label="Tokens"
          className="xl:border-l xl:border-border xl:pl-8"
          value={compact(metrics.inputTokens + metrics.outputTokens)}
          sub={`${compact(metrics.cacheReadTokens)} cache read · ${compact(metrics.cacheWriteTokens)} write`}
        />
        <SignalsKpi
          label="Verified usage"
          className="sm:border-l sm:border-border sm:pl-8"
          value={money(metrics.verifiedCost)}
          sub="vendor-reported charges"
        />
        <SignalsKpi
          label="Estimated API value"
          className="xl:border-l xl:border-border xl:pl-8"
          value={money(Math.max(0, metrics.cost - metrics.verifiedCost))}
          sub="rate-card reconstruction"
        />
      </div>

      <div className="mt-8">
        <h3 className="mb-3 text-sm font-medium">Token breakdown</h3>
        <TokenBreakdownChart
          input={metrics.inputTokens}
          output={metrics.outputTokens}
          cacheRead={metrics.cacheReadTokens}
          cacheWrite={metrics.cacheWriteTokens}
        />
      </div>

      <ModelTable
        title="Every model"
        description={`${usageModels.length} usage models with no truncation`}
        rows={usageModels}
      />

      {productivityModels.length > 0 ? (
        <ModelTable
          title="Productivity attribution"
          description="Lines and commits — not model calls or billed usage"
          rows={productivityModels}
        />
      ) : null}
    </section>
  );
}
