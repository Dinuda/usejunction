import type { ReactNode } from "react";
import { FlowSegment, type FlowDensity, type FlowRole } from "@/components/signals/flow-segment";
import { cn } from "@/lib/utils";

export function durationLabel(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.round(minutes / 60)}h`;
}

export function changeLabel(value: number | null) {
  if (value == null) return "—";
  if (value === 0) return "0%";
  return `${value > 0 ? "+" : ""}${value}%`;
}

function splitFlow(flow: string): string[] {
  return flow
    .split(/\s*(?:->|→)\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function roleFor(index: number, total: number): FlowRole {
  if (total === 3) return index === 1 ? "ai" : index === 0 ? "before" : "after";
  if (total === 2) return index === 0 ? "before" : "after";
  return index === 0 ? "before" : index === total - 1 ? "after" : "ai";
}

export function FlowPath({
  flow,
  className,
  density = "full",
  size = "md",
}: {
  flow: string;
  className?: string;
  density?: FlowDensity;
  size?: "md" | "lg";
}) {
  const parts = splitFlow(flow);
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5", className)}>
      {parts.map((part, index) => (
        <span key={`${part}-${index}`} className="inline-flex items-center gap-1.5">
          {index > 0 ? <span className="text-muted-foreground/50">→</span> : null}
          <FlowSegment label={part} role={roleFor(index, parts.length)} density={density} size={size} />
        </span>
      ))}
    </span>
  );
}

export function SignalsKpi({
  label,
  value,
  sub,
  footer,
  hero,
  accent,
  action,
  compactMobile = false,
  className,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  footer?: ReactNode;
  hero?: boolean;
  /** Pale yellow highlight — use for the primary cost / focus metric. */
  accent?: boolean;
  action?: ReactNode;
  compactMobile?: boolean;
  className?: string;
}) {
  const content = (
    <>
      <div
        className={cn(
          "relative flex items-center",
          compactMobile ? "h-6 sm:h-8" : "h-8",
        )}
      >
        <p
          className={cn(
            "min-w-0 font-medium uppercase tracking-[0.08em] text-muted-foreground",
            compactMobile ? "text-[0.65rem] leading-3 sm:text-xs sm:leading-4" : "text-xs leading-4",
            action ? "pr-10" : null,
          )}
        >
          {label}
        </p>
        {action ? (
          <div className="absolute inset-y-0 right-2 flex items-center justify-center">
            {action}
          </div>
        ) : null}
      </div>
      <div
        className={cn(
          // Shared value box so hero (text-4xl) and default (text-3xl) share one baseline.
          "flex items-end font-semibold tracking-tight tabular-nums leading-none",
          compactMobile ? "mt-1.5 min-h-8" : "mt-2 min-h-10",
          hero
            ? compactMobile
              ? "text-[1.75rem] sm:text-4xl"
              : "text-4xl"
            : compactMobile
              ? "text-[1.75rem] sm:text-3xl"
              : "text-3xl",
        )}
      >
        {value}
      </div>
      {sub ? (
        <div
          className={cn(
            "mt-2 text-muted-foreground",
            compactMobile ? "text-[0.68rem] leading-4 sm:text-xs" : "text-xs leading-4",
          )}
        >
          {sub}
        </div>
      ) : null}
      {footer ? <div className="mt-2">{footer}</div> : null}
    </>
  );

  return (
    <div
      className={cn(
        "relative flex h-full flex-col justify-start",
        compactMobile ? "min-h-24 py-3 sm:min-h-32 sm:py-5" : "min-h-32 py-5",
        !accent && className,
      )}
    >
      {accent ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 border-l-2 border-brand-yellow-dark bg-brand-yellow-pale"
        />
      ) : null}
      <div
        className={cn(
          "relative flex h-full flex-col justify-start",
          accent && cn(compactMobile ? "px-3 sm:px-5" : "px-5", className),
        )}
      >
        {content}
      </div>
    </div>
  );
}

export function SignalsSectionHeader({
  title,
  description,
  action,
  bordered = false,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  bordered?: boolean;
}) {
  return (
    <div className={cn("mb-6 flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between", bordered && "border-b pb-4")}>
      <div className="min-w-0">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {description ? <p className="mt-1.5 text-xs text-muted-foreground">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}
