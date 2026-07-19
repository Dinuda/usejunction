"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export type HubNavItem = {
  /** Link target (may include query string). */
  href: string;
  label: string;
  /** Pathname used for active matching when href includes a query. Defaults to href without query. */
  matchHref?: string;
  /** When true, only exact pathname matches (plus trailing slash). */
  exact?: boolean;
};

function pathOnly(href: string) {
  return href.split("?")[0] ?? href;
}

export function HubNav({
  items,
  className,
  "aria-label": ariaLabel = "Sections",
  justify = "end",
}: {
  items: HubNavItem[];
  className?: string;
  "aria-label"?: string;
  justify?: "start" | "end";
}) {
  const pathname = usePathname();

  return (
    <nav
      className={cn(
        "-mx-4 flex w-[calc(100%+2rem)] flex-nowrap items-stretch justify-start gap-0 overflow-x-auto overscroll-x-contain px-4 sm:mx-0 sm:w-auto sm:flex-wrap sm:overflow-visible sm:px-0",
        justify === "end" ? "sm:justify-end" : "sm:justify-start",
        className,
      )}
      aria-label={ariaLabel}
    >
      {items.map(({ href, label, matchHref, exact }) => {
        const matchPath = pathOnly(matchHref ?? href);
        const active = exact
          ? pathname === matchPath || pathname === `${matchPath}/`
          : pathname === matchPath || pathname.startsWith(`${matchPath}/`);
        return (
          <Link
            key={matchPath}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative -mb-px min-h-11 shrink-0 px-3.5 py-2.5 text-sm transition-colors",
              active
                ? "bg-muted font-semibold text-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-[3px] after:bg-foreground"
                : "font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground",
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Button-mode underline tabs (same chrome as HubNav, for non-route toggles). */
export function HubTabList({
  items,
  value,
  onChange,
  className,
  "aria-label": ariaLabel = "Views",
}: {
  items: { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn("flex max-w-full flex-nowrap items-stretch gap-0 overflow-x-auto overscroll-x-contain", className)}
    >
      {items.map(({ id, label }) => {
        const active = value === id;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(id)}
            className={cn(
              "relative -mb-px min-h-11 shrink-0 px-3.5 py-2.5 text-sm transition-colors",
              active
                ? "bg-muted font-semibold text-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-[3px] after:bg-foreground"
                : "font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground",
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
