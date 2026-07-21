"use client";

import { useEffect, useState } from "react";
import { AppPageSkeleton } from "@/components/app-data-state";
import { cn } from "@/lib/utils";

/**
 * First-visit / slow first paint: blurred shell + "Crunching your numbers."
 * Warm refreshes that finish under the delay never show this copy.
 */
export function DashboardCrunchingState({
  className,
  title = "Crunching your numbers.",
  subtitle = "Building your first usage snapshot.",
  /** Delay before revealing crunching copy (plain skeleton until then). */
  revealAfterMs = 1500,
}: {
  className?: string;
  title?: string;
  subtitle?: string;
  revealAfterMs?: number;
}) {
  const [reveal, setReveal] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setReveal(true), revealAfterMs);
    return () => window.clearTimeout(timer);
  }, [revealAfterMs]);

  if (!reveal) return <AppPageSkeleton />;

  return (
    <div
      className={cn("relative isolate min-h-[28rem] overflow-hidden", className)}
      aria-busy="true"
      aria-live="polite"
      aria-label={title}
    >
      <div className="pointer-events-none select-none opacity-100 blur-[2.5px]" aria-hidden>
        <div className="mb-8 space-y-3 border-b border-border/60 pb-6">
          <div className="h-9 w-56 rounded-md bg-muted/80" />
          <div className="h-4 w-80 max-w-full rounded-md bg-muted/50" />
        </div>
        <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="space-y-3 rounded-lg border border-border/50 bg-card/40 p-4">
              <div className="h-3 w-20 rounded bg-muted/70" />
              <div className="h-7 w-24 rounded bg-muted/90" />
              <div className="h-3 w-14 rounded bg-muted/40" />
            </div>
          ))}
        </div>
        <div className="rounded-lg border border-border/50 bg-card/30 p-5">
          <div className="mb-5 h-4 w-40 rounded bg-muted/60" />
          <div className="flex h-52 items-end gap-2 sm:gap-3">
            {[42, 68, 55, 78, 48, 62, 70, 58, 74, 50, 66, 80].map((height, index) => (
              <div
                key={index}
                className="flex-1 rounded-t-sm bg-muted/70"
                style={{ height: `${height}%` }}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/25">
        <div className="flex flex-col items-center gap-4 px-6 text-center">
          <span className="dashboard-crunch-arc" aria-hidden />
          <div className="space-y-1.5">
            <p className="font-display text-lg tracking-tight text-foreground sm:text-xl">
              {title}
            </p>
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
