"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { MetricPeriodFilter } from "@/components/dashboard/metric-period-filter";
import {
  cycleViewPeriodLabel,
  parseCycleView,
} from "@/lib/dashboard/cycle-view";
import {
  DEFAULT_ROLLING_PERIOD,
  periodsEqual,
  parseRollingPeriodFromSearch,
  readRollingPeriodPrefs,
  rollingPeriodHref,
} from "@/lib/dashboard/period-prefs";

/**
 * Global period cycler for the member hub — stays on the current tab and
 * applies to Overview / Work / Coding / Fleet via shared URL params.
 */
export function MemberHubPeriodFilter({ className }: { className?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const rawView = searchParams.get("view");
  const cycleView =
    rawView == null ? "last_30_days" : parseCycleView(rawView);
  const period = parseRollingPeriodFromSearch({
    days: searchParams.get("days") ?? undefined,
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
  });
  const periodLabel = cycleViewPeriodLabel(cycleView, period);

  useEffect(() => {
    if (cycleView !== "last_30_days") return;
    const hasExplicitPeriod =
      searchParams.has("days") || searchParams.has("from") || searchParams.has("to");
    if (hasExplicitPeriod) return;
    const stored = readRollingPeriodPrefs().active;
    if (periodsEqual(stored, DEFAULT_ROLLING_PERIOD)) return;
    router.replace(rollingPeriodHref(stored, pathname));
  }, [cycleView, pathname, router, searchParams]);

  return (
    <MetricPeriodFilter
      view={cycleView}
      period={period}
      basePath={pathname}
      label={periodLabel}
      className={className}
    />
  );
}
