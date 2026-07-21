"use client";

import { useSearchParams } from "next/navigation";
import { HubNav } from "@/components/hub-nav";
import { cn } from "@/lib/utils";

/** Work-first Signals nav. Classic journeys/tools stay out of the hub until Phase 2. */
const baseItems = [
  { path: "/signals", label: "Overview", exact: true },
  { path: "/signals/activity", label: "Activity" },
  { path: "/signals/settings", label: "Settings" },
] as const;

function withPreservedScope(path: string, search: string) {
  // Settings is org-only — drop audience scope when navigating there.
  if (path === "/signals/settings") return path;
  const params = new URLSearchParams(search);
  const scope = params.get("scope");
  if (scope !== "you" && scope !== "team") return path;
  const next = new URLSearchParams();
  next.set("scope", scope);
  // Preserve period params so Overview ↔ Activity stays in the same window.
  for (const key of ["view", "days", "from", "to"] as const) {
    const value = params.get(key);
    if (value) next.set(key, value);
  }
  return `${path}?${next.toString()}`;
}

export function SignalsHubNav({
  className,
}: {
  className?: string;
}) {
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const items = baseItems.map(({ path, label, ...rest }) => ({
    href: withPreservedScope(path, search),
    matchHref: path,
    label,
    ...("exact" in rest ? { exact: rest.exact } : {}),
  }));

  return (
    <HubNav
      items={items}
      className={cn("border-b border-border", className)}
      aria-label="Signals sections"
      justify="end"
    />
  );
}
