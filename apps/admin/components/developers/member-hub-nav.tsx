"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

const items = [
  { suffix: "", label: "Overview" },
  { suffix: "/work", label: "Work" },
  { suffix: "/coding", label: "Coding" },
  { suffix: "/fleet", label: "Fleet" },
] as const;

export function MemberHubNav({
  developerId,
  className,
}: {
  developerId: string;
  className?: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  const querySuffix = query ? `?${query}` : "";
  const base = `/team/${developerId}`;

  return (
    <nav
      className={cn("flex flex-wrap items-stretch justify-end gap-0", className)}
      aria-label="Member sections"
    >
      {items.map(({ suffix, label }) => {
        const href = `${base}${suffix}`;
        const active =
          suffix === ""
            ? pathname === base || pathname === `${base}/`
            : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={suffix || "overview"}
            href={`${href}${querySuffix}`}
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
