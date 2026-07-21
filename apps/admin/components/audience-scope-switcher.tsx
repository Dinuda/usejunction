"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { HubTabList } from "@/components/hub-nav";
import { audienceScopeHref, parseAudienceScope, type AudienceScope } from "@/lib/audience-scope";
import { cn } from "@/lib/utils";

const ITEMS: { id: AudienceScope; label: string }[] = [
  { id: "team", label: "Team" },
  { id: "you", label: "You" },
];

export function AudienceScopeSwitcher({ className }: { className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const value = parseAudienceScope(searchParams.get("scope"));

  return (
    <HubTabList
      items={ITEMS}
      value={value}
      onChange={(id) => {
        router.push(audienceScopeHref(pathname, id as AudienceScope, searchParams));
      }}
      className={cn("w-full justify-end border-b border-border", className)}
      aria-label="Audience"
    />
  );
}
