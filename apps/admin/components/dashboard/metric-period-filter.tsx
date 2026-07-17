"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Check, ListFilter } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CycleView } from "@/lib/dashboard/cycle-view";
import {
  PERIOD_PRESETS,
  periodsEqual,
  readRollingPeriodPrefs,
  rollingPeriodHref,
  rollingPeriodLabel,
  setActiveRollingPeriod,
  type RollingPeriod,
} from "@/lib/dashboard/period-prefs";
import { cn } from "@/lib/utils";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoIso(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - (days - 1));
  return date.toISOString().slice(0, 10);
}

function cycleHref(view: Exclude<CycleView, "last_30_days">, basePath: string) {
  return `${basePath}?view=${view}`;
}

/** Filter icon for time-scoped metrics: subscription cycles + rolling date ranges. */
export function MetricPeriodFilter({
  view,
  period,
  basePath,
  className,
}: {
  view: CycleView;
  period: RollingPeriod;
  basePath: string;
  className?: string;
}) {
  const router = useRouter();
  const [prefsPeriod, setPrefsPeriod] = useState(period);
  const [customOpen, setCustomOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState(
    period.kind === "custom" ? period.from : daysAgoIso(30),
  );
  const [customTo, setCustomTo] = useState(period.kind === "custom" ? period.to : todayIso());

  useEffect(() => {
    if (view === "last_30_days") {
      setPrefsPeriod(setActiveRollingPeriod(period).active);
      return;
    }
    setPrefsPeriod(readRollingPeriodPrefs().active);
  }, [period, view]);

  function go(href: string) {
    router.push(href);
  }

  function applyPeriod(next: RollingPeriod) {
    setPrefsPeriod(setActiveRollingPeriod(next).active);
    go(rollingPeriodHref(next, basePath));
  }

  function applyCustom() {
    if (!customFrom || !customTo || customFrom > customTo) return;
    applyPeriod({
      kind: "custom",
      id: `custom:${customFrom}:${customTo}`,
      from: customFrom,
      to: customTo,
    });
    setCustomOpen(false);
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Adjust period"
            className={cn(
              "inline-flex size-8 shrink-0 items-center justify-center border border-border bg-transparent text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground",
              className,
            )}
          >
            <ListFilter className="size-3.5" aria-hidden />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56 rounded-none">
          <DropdownMenuLabel className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
            Subscription cycles
          </DropdownMenuLabel>
          {(
            [
              ["current_cycles", "Current cycles"],
              ["previous_cycles", "Previous cycles"],
            ] as const
          ).map(([value, label]) => (
            <DropdownMenuItem
              key={value}
              className="rounded-none"
              onSelect={() => go(cycleHref(value, basePath))}
            >
              <span className="flex-1">{label}</span>
              {view === value ? <Check className="size-3.5" aria-hidden /> : null}
            </DropdownMenuItem>
          ))}

          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
            Rolling period
          </DropdownMenuLabel>
          {PERIOD_PRESETS.map((days) => {
            const option: RollingPeriod = { kind: "preset", days };
            const selected = view === "last_30_days" && periodsEqual(prefsPeriod, option);
            return (
              <DropdownMenuItem
                key={days}
                className="rounded-none"
                onSelect={() => applyPeriod(option)}
              >
                <span className="flex-1">Last {days} days</span>
                {selected ? <Check className="size-3.5" aria-hidden /> : null}
              </DropdownMenuItem>
            );
          })}

          {prefsPeriod.kind === "custom" && view === "last_30_days" ? (
            <DropdownMenuItem className="rounded-none" disabled>
              <span className="flex-1 truncate">{rollingPeriodLabel(prefsPeriod)}</span>
              <Check className="size-3.5 shrink-0" aria-hidden />
            </DropdownMenuItem>
          ) : null}

          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="rounded-none"
            onSelect={(event) => {
              event.preventDefault();
              setCustomFrom(period.kind === "custom" ? period.from : daysAgoIso(30));
              setCustomTo(period.kind === "custom" ? period.to : todayIso());
              setCustomOpen(true);
            }}
          >
            Custom date range…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={customOpen} onOpenChange={setCustomOpen}>
        <DialogContent className="rounded-none sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Custom date range</DialogTitle>
            <DialogDescription>Pick an inclusive UTC range for this metric.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="metric-period-from">From</Label>
              <Input
                id="metric-period-from"
                type="date"
                className="rounded-none"
                value={customFrom}
                max={customTo || todayIso()}
                onChange={(event) => setCustomFrom(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="metric-period-to">To</Label>
              <Input
                id="metric-period-to"
                type="date"
                className="rounded-none"
                value={customTo}
                min={customFrom || undefined}
                max={todayIso()}
                onChange={(event) => setCustomTo(event.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" className="rounded-none" onClick={() => setCustomOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              className="rounded-none"
              disabled={!customFrom || !customTo || customFrom > customTo}
              onClick={applyCustom}
            >
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
