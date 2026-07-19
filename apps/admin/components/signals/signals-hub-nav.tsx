"use client";

import { HubNav } from "@/components/hub-nav";
import { cn } from "@/lib/utils";

/** Work-first Signals nav. Classic journeys/tools stay out of the hub until Phase 2. */
const items = [
  { href: "/signals", label: "Overview", exact: true },
  { href: "/signals/activity", label: "Activity" },
  { href: "/signals/settings", label: "Settings" },
];

export function SignalsHubNav({
  className,
}: {
  className?: string;
}) {
  return (
    <HubNav
      items={items}
      className={cn("border-b border-border", className)}
      aria-label="Signals sections"
      justify="end"
    />
  );
}
