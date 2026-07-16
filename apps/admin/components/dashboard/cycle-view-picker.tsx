"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type MouseEvent } from "react";
import { Check, ListFilter, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DEFAULT_ROLLING_PERIOD,
  PERIOD_PRESETS,
  periodsEqual,
  readRollingPeriodPrefs,
  removeSavedRollingPeriod,
  rollingPeriodHref,
  rollingPeriodLabel,
  setActiveRollingPeriod,
  type CustomRollingPeriod,
  type RollingPeriod,
  type RollingPeriodPrefs,
} from "@/lib/dashboard/period-prefs";
import { cn } from "@/lib/utils";

type CycleView = "current_cycles" | "previous_cycles" | "last_30_days";

const cycleViewLabels: Record<Exclude<CycleView, "last_30_days">, string> = {
  current_cycles: "Current cycles",
  previous_cycles: "Previous cycles",
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoIso(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - (days - 1));
  return date.toISOString().slice(0, 10);
}

export function CycleViewPicker({
  view,
  period,
}: {
  view: CycleView;
  period: RollingPeriod;
}) {
  const router = useRouter();
  const [prefs, setPrefs] = useState<RollingPeriodPrefs>({
    active: period,
    saved: period.kind === "custom" ? [period] : [],
  });
  const [customOpen, setCustomOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState(
    period.kind === "custom" ? period.from : daysAgoIso(30),
  );
  const [customTo, setCustomTo] = useState(period.kind === "custom" ? period.to : todayIso());

  useEffect(() => {
    if (view === "last_30_days") {
      setPrefs(setActiveRollingPeriod(period));
      return;
    }
    setPrefs(readRollingPeriodPrefs());
  }, [period, view]);

  useEffect(() => {
    if (view !== "last_30_days") return;
    const params = new URLSearchParams(window.location.search);
    const hasExplicitPeriod = params.has("days") || params.has("from") || params.has("to");
    if (hasExplicitPeriod) return;
    const stored = readRollingPeriodPrefs().active;
    if (periodsEqual(stored, DEFAULT_ROLLING_PERIOD)) return;
    router.replace(rollingPeriodHref(stored));
  }, [router, view]);

  const rollingLabel = rollingPeriodLabel(prefs.active);

  function applyPeriod(next: RollingPeriod) {
    const updated = setActiveRollingPeriod(next);
    setPrefs(updated);
    router.push(rollingPeriodHref(next));
  }

  function deleteSaved(item: CustomRollingPeriod, event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    const updated = removeSavedRollingPeriod(item.id);
    setPrefs(updated);
    if (periodsEqual(period, item)) {
      router.push(rollingPeriodHref(DEFAULT_ROLLING_PERIOD));
    }
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
      <div className="flex flex-wrap items-center gap-1 border bg-card p-1" aria-label="Subscription view">
        {(["current_cycles", "previous_cycles"] as const).map((value) => (
          <Button key={value} asChild size="sm" variant="ghost">
            <Link
              href={`/dashboard?view=${value}`}
              className={cn(
                "h-8 rounded-none px-3 text-xs font-semibold",
                view === value
                  ? "!bg-secondary !text-foreground hover:!bg-secondary hover:!text-foreground"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
            >
              {cycleViewLabels[value]}
            </Link>
          </Button>
        ))}

        <div
          className={cn(
            "inline-flex h-8 items-stretch overflow-hidden",
            view === "last_30_days" ? "bg-secondary text-foreground" : "text-muted-foreground",
          )}
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Adjust rolling period"
                className={cn(
                  "inline-flex items-center justify-center px-2 transition-colors",
                  view === "last_30_days"
                    ? "hover:bg-muted/70"
                    : "hover:bg-muted/60 hover:text-foreground",
                )}
                onClick={(event) => event.stopPropagation()}
              >
                <ListFilter className="size-3.5" aria-hidden />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64 rounded-none">
              <DropdownMenuLabel className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
                Rolling period
              </DropdownMenuLabel>
              {PERIOD_PRESETS.map((days) => {
                const option: RollingPeriod = { kind: "preset", days };
                const selected = periodsEqual(prefs.active, option);
                return (
                  <DropdownMenuItem
                    key={days}
                    className="rounded-none"
                    onSelect={() => applyPeriod(option)}
                  >
                    <span className="flex-1">Last {days} days</span>
                    {selected ? <Check className="size-3.5 text-foreground" aria-hidden /> : null}
                  </DropdownMenuItem>
                );
              })}

              {prefs.saved.length > 0 ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
                    Saved ranges
                  </DropdownMenuLabel>
                  {prefs.saved.map((item) => {
                    const selected = periodsEqual(prefs.active, item);
                    return (
                      <DropdownMenuItem
                        key={item.id}
                        className="rounded-none"
                        onSelect={() => applyPeriod(item)}
                      >
                        <span className="flex-1 truncate">{rollingPeriodLabel(item)}</span>
                        {selected ? <Check className="size-3.5 shrink-0" aria-hidden /> : null}
                        <button
                          type="button"
                          aria-label={`Remove ${rollingPeriodLabel(item)}`}
                          className="rounded-sm p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                          onPointerDown={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                          }}
                          onClick={(event) => deleteSaved(item, event)}
                        >
                          <Trash2 className="size-3.5" aria-hidden />
                        </button>
                      </DropdownMenuItem>
                    );
                  })}
                </>
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

          <Button asChild size="sm" variant="ghost" className="h-8 rounded-none px-0">
            <Link
              href={rollingPeriodHref(prefs.active)}
              className={cn(
                "h-8 rounded-none px-3 text-xs font-semibold",
                view === "last_30_days"
                  ? "!bg-transparent !text-foreground hover:!bg-transparent hover:!text-foreground"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
            >
              {rollingLabel}
            </Link>
          </Button>
        </div>
      </div>

      <Dialog open={customOpen} onOpenChange={setCustomOpen}>
        <DialogContent className="rounded-none sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Custom date range</DialogTitle>
            <DialogDescription>
              Pick an inclusive UTC range. It is saved so you can reuse it from the filter.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="period-from">From</Label>
              <Input
                id="period-from"
                type="date"
                className="rounded-none"
                value={customFrom}
                max={customTo || todayIso()}
                onChange={(event) => setCustomFrom(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="period-to">To</Label>
              <Input
                id="period-to"
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
              Save & apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
