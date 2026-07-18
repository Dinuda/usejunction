"use client";

import type { MemberPlanBoardCard } from "@/lib/quotas/plan-board";
import type { QuotaPaceCode } from "@/lib/quotas/pace";
import { cn } from "@/lib/utils";

const COLS = 14;

function cellTone(code: QuotaPaceCode, lit: boolean, pastExpected: boolean) {
  if (!lit) return "bg-muted";
  if (code === "ALREADY_EXCEEDED" || code === "EXCESS") {
    return pastExpected ? "bg-destructive" : "bg-destructive/70";
  }
  if (code === "ON_TRACK") return "bg-foreground/75";
  if (code === "UNDER") return "bg-foreground/40";
  return "bg-foreground/55";
}

type PaceRow = {
  key: string;
  label: string;
  used: number;
  expected: number | null;
  code: QuotaPaceCode;
};

function rowsFromCards(cards: MemberPlanBoardCard[]): PaceRow[] {
  return cards
    .filter((card) => card.pace.usedPercent != null)
    .map((card) => ({
      key: card.toolKey,
      label: card.toolLabel,
      used: Math.min(100, Math.max(0, card.pace.usedPercent!)),
      expected:
        card.pace.expectedPercent == null
          ? null
          : Math.min(100, Math.max(0, card.pace.expectedPercent)),
      code: card.pace.code,
    }));
}

/**
 * Contribution-style pace mosaic — one row per plan, cells = window progress.
 * Steady reads as even fill fronts clustered near the expected tick.
 */
export function PlanPaceGraph({
  cards,
  className,
}: {
  cards: MemberPlanBoardCard[];
  className?: string;
}) {
  const rows = rowsFromCards(cards);
  if (!rows.length) return null;

  const title = rows
    .map((row) => {
      const mark =
        row.expected != null ? ` · expected ~${Math.round(row.expected)}%` : "";
      return `${row.label} ${Math.round(row.used)}%${mark}`;
    })
    .join(" · ");

  return (
    <div
      className={cn("mt-3 max-w-[13.5rem]", className)}
      title={title}
      role="img"
      aria-label={title}
    >
      <div className="flex flex-col gap-[3px]">
        {rows.map((row) => {
          const filled =
            row.used <= 0 ? 0 : Math.max(1, Math.round((row.used / 100) * COLS));
          const mark =
            row.expected == null ? null : Math.round((row.expected / 100) * COLS);
          return (
            <div key={row.key} className="relative flex gap-[2px]">
              {Array.from({ length: COLS }, (_, i) => {
                const lit = i < filled;
                const pastExpected = mark != null && i >= mark;
                return (
                  <span
                    key={i}
                    className={cn(
                      "size-[7px] shrink-0 transition-colors",
                      cellTone(row.code, lit, pastExpected),
                    )}
                  />
                );
              })}
              {mark != null && mark > 0 && mark < COLS ? (
                <span
                  aria-hidden
                  className="pointer-events-none absolute top-[-1px] h-[calc(100%+2px)] w-px bg-foreground/50"
                  style={{ left: `calc(${mark} * 9px - 1px)` }}
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
