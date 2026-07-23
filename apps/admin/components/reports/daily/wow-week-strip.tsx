"use client";

import { formatCompactNumber, formatUsd } from "@/lib/format";
import {
  metricOf,
  WOW_OUTLIER_DELTA_PCT,
  type RhythmMetric,
  type WowWeekStripV1,
  type WowWeekdayCell,
} from "@/lib/reports/wow-week-strip";
import { cn } from "@/lib/utils";

function cellValue(cell: WowWeekdayCell, metric: RhythmMetric) {
  return metricOf(cell, metric);
}

function formatMetric(value: number, metric: RhythmMetric) {
  if (metric === "cost") return formatUsd(value);
  return formatCompactNumber(value);
}

function intensityClass(value: number, max: number): string {
  if (max <= 0 || value <= 0) return "border border-border bg-transparent";
  const t = value / max;
  if (t < 0.2) return "border border-primary/20 bg-primary/25";
  if (t < 0.4) return "border border-primary/30 bg-primary/40";
  if (t < 0.65) return "border border-primary/40 bg-primary/60";
  if (t < 0.85) return "border border-primary/50 bg-primary/80";
  return "border border-primary bg-primary";
}

function cellTitle(cell: WowWeekdayCell, metric: RhythmMetric) {
  const isFuture = cell.isPartial && !cell.isToday;
  if (isFuture) return `${cell.label} · upcoming`;
  const value = formatMetric(cellValue(cell, metric), metric);
  const unit = metric === "cost" ? "spend" : metric;
  if (cell.deltaPct == null) {
    return `${cell.label} ${cell.localDate.slice(5)} · ${value} ${unit}`;
  }
  const sign = cell.deltaPct >= 0 ? "+" : "";
  return `${cell.label} ${cell.localDate.slice(5)} · ${value} ${unit} · ${sign}${cell.deltaPct.toFixed(0)}% vs prior day`;
}

export function WowWeekStrip({
  strip,
  metric,
  className,
}: {
  strip: WowWeekStripV1;
  metric?: RhythmMetric;
  className?: string;
}) {
  const activeMetric = metric ?? strip.metricDefault;
  const max = Math.max(...strip.cells.map((c) => cellValue(c, activeMetric)), 0);

  return (
    <div className={cn("w-full", className)}>
      <p className="text-sm leading-6 text-muted-foreground">{strip.insight.headline}</p>
      {strip.availability === "partial" ? (
        <p className="mt-1 text-xs text-muted-foreground">Comparing available prior days.</p>
      ) : null}

      <div
        className="mt-5 grid grid-cols-7 gap-2 sm:gap-3"
        role="img"
        aria-label={`Day-over-day ${activeMetric} strip from ${strip.weekStart} to ${strip.weekEnd}`}
      >
        {strip.cells.map((cell) => {
          const value = cellValue(cell, activeMetric);
          const isFuture = cell.isPartial && !cell.isToday;
          const heightPct = max > 0 && value > 0 ? Math.max(14, Math.round((value / max) * 100)) : 0;

          return (
            <div key={cell.localDate} className="min-w-0 text-center">
              <div
                title={cellTitle(cell, activeMetric)}
                className={cn(
                  "mx-auto flex h-14 w-full max-w-[4.5rem] items-end justify-center sm:h-16",
                  isFuture && "opacity-40",
                )}
              >
                <div
                  className={cn(
                    "w-full",
                    heightPct > 0 ? intensityClass(value, max) : "border border-border bg-transparent",
                    cell.isOutlier && "ring-2 ring-primary ring-offset-2 ring-offset-background",
                    cell.isToday && "outline outline-1 outline-offset-2 outline-foreground/30",
                  )}
                  style={{ height: heightPct > 0 ? `${heightPct}%` : "100%" }}
                >
                  <span className="sr-only">{cellTitle(cell, activeMetric)}</span>
                </div>
              </div>
              <p
                className={cn(
                  "mt-2 text-[11px] font-medium tabular-nums text-muted-foreground sm:text-xs",
                  cell.isToday && "text-foreground",
                )}
              >
                {cell.label}
              </p>
              {cell.isOutlier && cell.deltaPct != null ? (
                <p className="mt-0.5 text-[10px] font-medium tabular-nums text-foreground">
                  {cell.deltaPct >= 0 ? "+" : ""}
                  {cell.deltaPct.toFixed(0)}%
                </p>
              ) : (
                <p className="mt-0.5 text-[10px] tabular-nums text-transparent select-none">0%</p>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
        <span>Bar height = daily {activeMetric}</span>
        <span>Ring = ±{WOW_OUTLIER_DELTA_PCT}% vs prior day</span>
      </div>
    </div>
  );
}
