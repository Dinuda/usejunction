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
  hero,
  accent,
  action,
  className,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  hero?: boolean;
  accent?: boolean;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      {action ? <div className="absolute right-3 top-0 z-10 sm:right-4">{action}</div> : null}
      <p
        className={cn(
          "text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground",
          action && "pr-12",
        )}
      >
        {label}
      </p>
      <div
        className={cn(
          "mt-2 font-semibold tracking-tight tabular-nums",
          hero ? "text-4xl" : "text-3xl",
          accent && "text-primary",
        )}
      >
        {value}
      </div>
      {sub ? <div className="mt-1 text-xs text-muted-foreground">{sub}</div> : null}
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
    <div className={cn("mb-6 flex items-end justify-between gap-3", bordered && "border-b pb-4")}>
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {description ? <p className="mt-1.5 text-xs text-muted-foreground">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}
