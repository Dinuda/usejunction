import type { ReactNode } from "react";
import { SignalsHubNav } from "@/components/signals/signals-hub-nav";

export function SignalsPageHeader({
  title,
  description,
  eyebrow,
  children,
}: {
  title: ReactNode;
  description?: string;
  /** Optional line above the title (e.g. back link on journey detail). */
  eyebrow?: ReactNode;
  /** Extra content under the title row (e.g. journey FlowPath). */
  children?: ReactNode;
}) {
  return (
    <header className="mb-10 space-y-5">
      {eyebrow ? <div>{eyebrow}</div> : null}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-[2.15rem]">{title}</h1>
          {description ? (
            <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>
          ) : null}
        </div>
        <div className="shrink-0 sm:pb-0.5">
          <SignalsHubNav />
        </div>
      </div>
      {children ? <div>{children}</div> : null}
    </header>
  );
}
