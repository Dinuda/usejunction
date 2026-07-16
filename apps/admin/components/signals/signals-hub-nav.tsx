"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const items = [
  ["/signals", "Overview"],
  ["/signals/journeys", "Journeys"],
  ["/signals/tools", "Tools"],
  ["/signals/activity", "Activity"],
  ["/signals/settings", "Settings"],
] as const;

export function SignalsHubNav({ className }: { className?: string }) {
  const pathname = usePathname();
  return (
    <nav
      className={cn("flex flex-wrap items-stretch justify-end gap-0 border-b border-border", className)}
      aria-label="Signals sections"
    >
      {items.map(([href, label]) => {
        const active =
          href === "/signals" ? pathname === "/signals" : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative -mb-px px-3.5 py-2.5 text-sm transition-colors",
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
