"use client";

import { DashboardMeterBar } from "@/components/dashboard/dashboard-meter-bar";

export type CoverageChartRow = {
  label: string;
  value: string;
  pct: number;
};

export function CoverageChart({ rows }: { rows: CoverageChartRow[] }) {
  return (
    <dl className="space-y-5">
      {rows.map((row) => (
        <div key={row.label}>
          <div className="mb-2 flex items-center justify-between text-sm">
            <dt className="text-muted-foreground">{row.label}</dt>
            <dd className="font-medium tabular-nums">{row.value}</dd>
          </div>
          <DashboardMeterBar
            value={row.pct}
            aria-label={`${row.label} ${Math.round(row.pct)} percent`}
          />
        </div>
      ))}
    </dl>
  );
}
