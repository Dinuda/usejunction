"use client";

import { useMemo, useState } from "react";
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

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="border-l-2 border-border-strong pl-4">
      <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
      {sub ? <p className="mt-1 text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

function TokenBar({
  input,
  output,
  cacheRead,
  cacheWrite,
}: {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}) {
  const total = input + output + cacheRead + cacheWrite;
  if (total <= 0) {
    return <p className="text-sm text-muted-foreground">No token breakdown yet.</p>;
  }
  const parts = [
    { label: "In", value: input, className: "bg-foreground/80" },
    { label: "Out", value: output, className: "bg-foreground/50" },
    { label: "Cache read", value: cacheRead, className: "bg-brand-yellow-dark" },
    { label: "Cache write", value: cacheWrite, className: "bg-border-strong" },
  ].filter((part) => part.value > 0);

  return (
    <div>
      <div className="flex h-2 overflow-hidden rounded-sm bg-muted">
        {parts.map((part) => (
          <div
            key={part.label}
            className={cn(part.className)}
            style={{ width: `${Math.max(2, (part.value / total) * 100)}%` }}
            title={`${part.label}: ${compact(part.value)}`}
          />
        ))}
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        {parts.map((part) => (
          <div key={part.label}>
            <dt className="text-muted-foreground">{part.label}</dt>
            <dd className="font-medium tabular-nums">{compact(part.value)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function CostBadge({ row }: { row: ModelUsageRow }) {
  if (row.metricKind === "productivity") {
    return <Badge variant="outline">Productivity</Badge>;
  }
  if (row.costKind === "verified_usage" || row.verified) {
    return <Badge variant="default">Verified</Badge>;
  }
  if (row.costKind === "estimated_api") {
    return <Badge variant="secondary">Estimated</Badge>;
  }
  return <Badge variant="outline">{row.source}</Badge>;
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
          className="h-8 w-full max-w-xs text-sm"
        />
      </div>
      {filtered.length ? (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b text-xs uppercase tracking-[0.06em] text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3 font-medium">Tool</th>
                  <th className="py-2 pr-3 font-medium">Model</th>
                  <th className="py-2 pr-3 font-medium tabular-nums">Calls</th>
                  <th className="py-2 pr-3 font-medium tabular-nums">In</th>
                  <th className="py-2 pr-3 font-medium tabular-nums">Out</th>
                  <th className="py-2 pr-3 font-medium tabular-nums">Cache</th>
                  <th className="py-2 pr-3 font-medium tabular-nums">Cost</th>
                  <th className="py-2 font-medium">Kind</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {pageRows.map((row) => (
                  <tr key={`${row.toolName}-${row.model}-${row.source}-${row.metricKind}`}>
                    <td className="py-2.5 pr-3 font-medium">{row.toolName}</td>
                    <td className="max-w-[220px] truncate py-2.5 pr-3 font-mono text-xs">{row.model}</td>
                    <td className="py-2.5 pr-3 tabular-nums">{compact(row.requests)}</td>
                    <td className="py-2.5 pr-3 tabular-nums">{compact(row.inputTokens)}</td>
                    <td className="py-2.5 pr-3 tabular-nums">{compact(row.outputTokens)}</td>
                    <td className="py-2.5 pr-3 tabular-nums">
                      {compact(row.cacheReadTokens + row.cacheWriteTokens)}
                    </td>
                    <td className="py-2.5 pr-3 tabular-nums">{money(row.cost)}</td>
                    <td className="py-2.5">
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
}: {
  metrics: AiCodingMetrics;
  models: ModelUsageRow[];
}) {
  const acceptance =
    metrics.suggestedLines > 0 ? (metrics.acceptedLines / metrics.suggestedLines) * 100 : null;
  const usageModels = models.filter((row) => row.metricKind !== "productivity");
  const productivityModels = models.filter((row) => row.metricKind === "productivity");

  return (
    <section className="mt-10">
      <div className="mb-4 border-b pb-3">
        <h2 className="text-lg font-semibold tracking-tight">AI coding.</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Verified vendor charges and estimated API-equivalent values are shown separately. Prompt text is never collected.
        </p>
      </div>

      <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Metric label="Requests" value={compact(metrics.requests)} sub="last 30 days" />
        <Metric
          label="AI lines accepted"
          value={compact(metrics.acceptedLines)}
          sub={
            metrics.suggestedLines > 0
              ? `${compact(metrics.suggestedLines)} suggested · ${pct(acceptance)} accept`
              : undefined
          }
        />
        <Metric
          label="AI-driven commits"
          value={metrics.aiPercent != null ? pct(metrics.aiPercent) : compact(metrics.commits)}
          sub={metrics.commits > 0 ? `${metrics.commits} scored commits` : "from Cursor tracking"}
        />
        <Metric
          label="Tokens"
          value={compact(metrics.inputTokens + metrics.outputTokens)}
          sub={`${compact(metrics.cacheReadTokens)} cache read · ${compact(metrics.cacheWriteTokens)} write`}
        />
        <Metric
          label="Verified usage"
          value={money(metrics.verifiedCost)}
          sub="vendor-reported charges"
        />
        <Metric
          label="Estimated API value"
          value={money(Math.max(0, metrics.cost - metrics.verifiedCost))}
          sub="rate-card reconstruction"
        />
      </div>

      <div className="mt-8">
        <h3 className="mb-3 text-sm font-medium">Token breakdown</h3>
        <TokenBar
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
