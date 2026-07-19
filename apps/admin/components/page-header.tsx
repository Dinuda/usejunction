import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
  mobileActionsInline = false,
  children,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  /** Optional line above the title (e.g. back link / breadcrumb). */
  eyebrow?: ReactNode;
  actions?: ReactNode;
  /** Keep compact actions, such as an icon-only filter, beside the title on phones. */
  mobileActionsInline?: boolean;
  /** Extra content under the title row (filters, hub nav, etc.). */
  children?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("mb-8 min-w-0 space-y-4 sm:mb-10 sm:space-y-5", className)}>
      {eyebrow ? <div>{eyebrow}</div> : null}
      <div
        className={cn(
          "flex gap-4 sm:flex-row sm:items-end sm:justify-between",
          mobileActionsInline ? "flex-row items-start justify-between" : "flex-col",
        )}
      >
        <div className="min-w-0">
          <h1 className="break-words text-[1.75rem] font-semibold leading-tight tracking-tight sm:text-[2.15rem]">{title}</h1>
          {description ? (
            <div className="mt-1.5 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</div>
          ) : null}
        </div>
        {actions ? (
          <div
            className={cn(
              "flex min-w-0 flex-col items-stretch gap-3 sm:ml-auto sm:mr-6 sm:shrink-0 sm:items-end sm:pb-0.5 lg:mr-8",
              mobileActionsInline && "shrink-0 items-end",
            )}
          >
            {actions}
          </div>
        ) : null}
      </div>
      {children}
    </header>
  );
}
