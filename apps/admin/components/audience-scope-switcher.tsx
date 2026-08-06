"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { audienceScopeHref, parseAudienceScope, type AudienceScope } from "@/lib/audience-scope";
import { cn } from "@/lib/utils";

const ITEMS: { id: AudienceScope; label: string }[] = [
  { id: "team", label: "Team" },
  { id: "you", label: "You" },
];

/**
 * Team | You audience switcher. Uses real links (not button + router.push) so
 * scope changes survive slow dashboard RSC / rematerialize work — soft pushes
 * can be dropped under load and leave the URL stuck on /dashboard.
 */
export function AudienceScopeSwitcher({ className }: { className?: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const value = parseAudienceScope(searchParams.get("scope"));

  return (
    <div
      role="tablist"
      aria-label="Audience"
      className={cn("flex w-full max-w-full flex-nowrap items-stretch justify-end gap-0 border-b border-border", className)}
    >
      {ITEMS.map(({ id, label }) => {
        const active = value === id;
        return (
          <Link
            key={id}
            href={audienceScopeHref(pathname, id, searchParams)}
            role="tab"
            aria-selected={active}
            scroll={false}
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
    </div>
  );
}
