"use client";

import * as React from "react";
import { ToolLogoTile } from "@/components/tools/tool-brand-icon";
import { MemberWorkSessionList } from "@/components/developers/member-work-session-list";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { paceVerdictLabel, type QuotaPaceCode } from "@/lib/quotas/pace";
import type {
  MemberPlanBoardCard,
  MemberPlanWindow,
} from "@/lib/quotas/plan-board";
import type { WorkActivitySession } from "@/lib/signals/queries/get-work-activity";
import { cn } from "@/lib/utils";

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value < 1 ? 3 : 2,
  }).format(value);
}

function compact(value: number) {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function toneForPace(code: QuotaPaceCode) {
  switch (code) {
    case "EXCESS":
    case "ALREADY_EXCEEDED":
      return "text-destructive";
    case "ON_TRACK":
      return "text-primary";
    case "UNDER":
      return "text-muted-foreground";
    default:
      return "text-muted-foreground";
  }
}

function barTone(code: QuotaPaceCode, usedPercent: number | null) {
  if (usedPercent != null && usedPercent >= 100) return "bg-destructive";
  if (code === "EXCESS" || code === "ALREADY_EXCEEDED") return "bg-destructive";
  if (usedPercent != null && usedPercent >= 85) return "bg-brand-yellow-dark";
  if (code === "ON_TRACK") return "bg-primary";
  return "bg-foreground/70";
}

function resetLabel(window: MemberPlanWindow): string | null {
  if (!window.resetsAt) return null;
  const date = new Date(window.resetsAt);
  if (Number.isNaN(date.getTime())) return null;
  const days = Math.round((date.getTime() - Date.now()) / 86_400_000);
  if (days <= 0) return "resets soon";
  if (days === 1) return "resets in 1d";
  return `resets in ${days}d`;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[0.65rem] uppercase tracking-[0.08em] text-muted-foreground/80">{label}</p>
      <p className="mt-0.5 text-sm tabular-nums text-foreground">{value}</p>
    </div>
  );
}

function WindowMeter({
  window,
  code,
  summary,
}: {
  window: MemberPlanWindow;
  code: QuotaPaceCode;
  summary?: string | null;
}) {
  const used = window.usedPercent;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-medium">{window.windowLabel}</p>
        <p className={cn("text-sm font-semibold tabular-nums", toneForPace(code))}>
          {used != null ? `${Math.round(used)}%` : "—"}
        </p>
      </div>
      <div className="mt-2 h-1.5 w-full bg-muted">
        <div
          className={cn("h-full", barTone(code, used))}
          style={{ width: `${used != null ? Math.min(100, Math.max(2, used)) : 0}%` }}
        />
      </div>
      {summary ? <p className="mt-1.5 text-xs text-muted-foreground">{summary}</p> : null}
    </div>
  );
}

function PlanCardButton({
  card,
  workSessions,
}: {
  card: MemberPlanBoardCard;
  workSessions: WorkActivitySession[];
}) {
  const [open, setOpen] = React.useState(false);
  const used = card.pace.usedPercent;
  const expected = card.pace.expectedPercent;
  const width = used == null ? 0 : Math.min(100, Math.max(2, used));
  const mark = expected == null ? null : Math.min(100, Math.max(0, expected));
  const reset = card.primary ? resetLabel(card.primary) : null;
  const tokens = card.usage?.tokens ?? 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="bg-card p-5 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <ToolLogoTile tool={card.toolName} size="md" light className="shrink-0" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold tracking-tight">{card.toolLabel}</p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {card.planName || card.primary?.windowLabel || "Plan"}
              </p>
            </div>
          </div>
          <div className="shrink-0 text-right">
            <p className={cn("text-2xl font-semibold tabular-nums", toneForPace(card.pace.code))}>
              {used != null ? `${Math.round(used)}%` : "—"}
            </p>
            <p className={cn("mt-0.5 text-[0.7rem] font-medium", toneForPace(card.pace.code))}>
              {paceVerdictLabel(card.pace.code)}
            </p>
          </div>
        </div>

        {used != null ? (
          <div className="relative mt-4 h-1.5 w-full bg-muted">
            <div
              className={cn("h-full transition-[width]", barTone(card.pace.code, used))}
              style={{ width: `${width}%` }}
            />
            {mark != null ? (
              <span
                aria-hidden
                className="absolute top-[-2px] h-[calc(100%+4px)] w-px bg-foreground/45"
                style={{ left: `${mark}%` }}
              />
            ) : null}
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-3">
          {tokens > 0 ? <Stat label="Tokens" value={compact(tokens)} /> : null}
          {card.usage && card.usage.cost > 0 ? (
            <Stat label="Usage" value={money(card.usage.cost)} />
          ) : null}
          {reset ? <Stat label="Reset" value={reset} /> : null}
          {card.promotions.map((promo) => (
            <Stat
              key={promo.quotaKey}
              label={promo.windowLabel}
              value={promo.remainingLabel ?? promo.signal}
            />
          ))}
        </div>
      </button>

      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <ToolLogoTile tool={card.toolName} size="md" light />
            <div>
              <DialogTitle className="text-lg">{card.toolLabel}</DialogTitle>
              <DialogDescription>
                {[card.planName, card.primary?.windowLabel].filter(Boolean).join(" · ") ||
                  "Plan usage and recent work"}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-6">
          <section className="space-y-3">
            {card.primary ? (
              <WindowMeter window={card.primary} code={card.pace.code} summary={card.pace.summary} />
            ) : (
              <p className="text-sm text-muted-foreground">No live plan window reported.</p>
            )}
            {card.otherWindows
              .filter((window) => window.usedPercent != null)
              .map((window) => (
                <WindowMeter key={window.quotaKey} window={window} code="ON_TRACK" />
              ))}
          </section>

          <section className="flex flex-wrap gap-x-8 gap-y-4">
            {tokens > 0 ? <Stat label="Tokens" value={compact(tokens)} /> : null}
            {card.usage && card.usage.cost > 0 ? (
              <Stat label="Usage" value={money(card.usage.cost)} />
            ) : null}
            {card.usage && card.usage.requests > 0 ? (
              <Stat label="Calls" value={compact(card.usage.requests)} />
            ) : null}
            {reset ? <Stat label="Reset" value={reset} /> : null}
            {card.promotions.map((promo) => (
              <Stat
                key={promo.quotaKey}
                label={promo.windowLabel}
                value={promo.remainingLabel ?? promo.signal}
              />
            ))}
          </section>

          <section>
            <p className="mb-3 text-[0.65rem] uppercase tracking-[0.08em] text-muted-foreground">
              Recent work
            </p>
            {workSessions.length ? (
              <MemberWorkSessionList
                sessions={workSessions.slice(0, 12)}
                emptyMessage="No extracted work in this period."
                maxHeightClass="max-h-[22rem]"
                density="teaser"
                fromTeam
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                No extracted work for {card.toolLabel} in this period.
              </p>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function MemberPlanBoard({
  cards,
  workSessionsByTool,
}: {
  cards: MemberPlanBoardCard[];
  workSessionsByTool?: Record<string, WorkActivitySession[]>;
}) {
  if (!cards.length) return null;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {cards.map((card) => (
        <PlanCardButton
          key={card.toolKey}
          card={card}
          workSessions={workSessionsByTool?.[card.toolKey] ?? []}
        />
      ))}
    </div>
  );
}
