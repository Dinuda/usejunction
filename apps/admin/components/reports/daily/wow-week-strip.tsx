"use client";

import type { CSSProperties } from "react";
import { formatCompactNumber, formatUsd } from "@/lib/format";
import {
  metricOf,
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

/** Cyan intensity — peak day uses brand orange. */
function barStyle(value: number, max: number, isPeak: boolean): CSSProperties | undefined {
  if (max <= 0 || value <= 0) return undefined;
  if (isPeak) return { backgroundColor: "#c0682c", borderColor: "#c0682c" };
  const t = value / max;
  if (t < 0.25) return { backgroundColor: "#dceef1", borderColor: "#a8d0d8" };
  if (t < 0.5) return { backgroundColor: "#a8d0d8", borderColor: "#08758a" };
  if (t < 0.75) return { backgroundColor: "#4fa0b0", borderColor: "#08758a" };
  return { backgroundColor: "#08758a", borderColor: "#08758a" };
}

function cellTitle(cell: WowWeekdayCell, metric: RhythmMetric) {
  const isFuture = cell.isPartial && !cell.isToday;
  if (isFuture) return `${cell.label} · upcoming`;
  const value = formatMetric(cellValue(cell, metric), metric);
  const unit = metric === "cost" ? "spend" : metric;
  return `${cell.label} ${cell.localDate.slice(5)} · ${value} ${unit}`;
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
      <div
        className="mt-1 grid grid-cols-7 gap-2 sm:gap-3"
        role="img"
        aria-label={`Weekly ${activeMetric} strip from ${strip.weekStart} to ${strip.weekEnd}`}
      >
        {strip.cells.map((cell) => {
          const value = cellValue(cell, activeMetric);
          const isFuture = cell.isPartial && !cell.isToday;
          const isPeak = value > 0 && value === max;
          const heightPct = max > 0 && value > 0 ? Math.max(14, Math.round((value / max) * 100)) : 0;
          const fill = barStyle(value, max, isPeak);

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
                    "w-full border",
                    heightPct > 0 ? "border-transparent" : "border-border bg-transparent",
                    cell.isToday && "outline outline-2 outline-offset-1 outline-foreground",
                  )}
                  style={{
                    height: heightPct > 0 ? `${heightPct}%` : "100%",
                    ...fill,
                  }}
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
              {value > 0 ? (
                <p className="mt-0.5 text-[10px] font-semibold tabular-nums text-foreground">
                  {formatMetric(value, activeMetric)}
                </p>
              ) : (
                <p className="mt-0.5 text-[10px] tabular-nums text-transparent select-none">0</p>
              )}
            </div>
          );
        })}
      </div>

      <p className="mt-4 text-[11px] text-muted-foreground">
        {activeMetric === "cost"
          ? "Spend this week"
          : activeMetric === "requests"
            ? "Requests this week"
            : "Tokens this week"}
      </p>
    </div>
  );
}
