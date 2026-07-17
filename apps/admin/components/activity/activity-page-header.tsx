import type { ReactNode } from "react";
import { ActivityHubNav } from "@/components/activity/activity-hub-nav";

export function ActivityPageHeader({
  title,
  description,
  showNav = false,
  actions,
}: {
  title: ReactNode;
  description?: string;
  showNav?: boolean;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-10 space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-[2.15rem]">{title}</h1>
          {description ? (
            <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col items-stretch gap-3 sm:items-end sm:pb-0.5">
          {actions}
          {showNav ? <ActivityHubNav /> : null}
        </div>
      </div>
    </header>
  );
}
