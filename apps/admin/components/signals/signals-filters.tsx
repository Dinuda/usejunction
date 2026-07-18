"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

const DEBOUNCE_MS = 400;

export type SignalsFilterOption = {
  id: string;
  name: string;
};

export type SignalsFiltersValue = {
  teamId?: string;
  tool?: string;
  developerId?: string;
};

type SignalsFiltersProps = {
  value: SignalsFiltersValue;
  teams?: SignalsFilterOption[];
  tools?: string[];
  developers?: SignalsFilterOption[];
  showTeam?: boolean;
  showTool?: boolean;
  showPerson?: boolean;
  className?: string;
};

const selectClassName =
  "block h-9 border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

function buildHref(
  pathname: string,
  next: SignalsFiltersValue,
  searchParams: URLSearchParams,
  fields: { showTeam: boolean; showTool: boolean; showPerson: boolean },
) {
  const params = new URLSearchParams();
  for (const key of ["view", "days", "from", "to"] as const) {
    const value = searchParams.get(key);
    if (value) params.set(key, value);
  }
  if (fields.showTeam && next.teamId) params.set("teamId", next.teamId);
  if (fields.showTool && next.tool) params.set("tool", next.tool);
  if (fields.showPerson && next.developerId) params.set("developerId", next.developerId);
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function SignalsFilters({
  value,
  teams = [],
  tools = [],
  developers = [],
  showTeam = true,
  showTool = true,
  showPerson = false,
  className,
}: SignalsFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [draft, setDraft] = useState(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setDraft(value);
  }, [value.teamId, value.tool, value.developerId]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  function scheduleApply(patch: Partial<SignalsFiltersValue>) {
    setDraft((prev) => {
      const next = { ...prev, ...patch };
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        const href = buildHref(pathname, next, searchParams, { showTeam, showTool, showPerson });
        startTransition(() => {
          router.push(href);
        });
      }, DEBOUNCE_MS);
      return next;
    });
  }

  return (
    <div className={cn("mb-6 flex w-full flex-wrap items-end justify-end gap-3", className)}>
      {showPerson ? (
        <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
          Person
          <select
            value={draft.developerId ?? ""}
            onChange={(event) => scheduleApply({ developerId: event.target.value || undefined })}
            className={cn(selectClassName, "min-w-[11rem]")}
          >
            <option value="">All people</option>
            {developers.map((developer) => (
              <option key={developer.id} value={developer.id}>
                {developer.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {showTeam ? (
        <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
          Team
          <select
            value={draft.teamId ?? ""}
            onChange={(event) => scheduleApply({ teamId: event.target.value || undefined })}
            className={cn(selectClassName, "min-w-[11rem]")}
          >
            <option value="">All teams</option>
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {showTool ? (
        <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
          AI tool
          <select
            value={draft.tool ?? ""}
            onChange={(event) => scheduleApply({ tool: event.target.value || undefined })}
            className={cn(selectClassName, "min-w-[9rem]")}
          >
            <option value="">All tools</option>
            {tools.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </div>
  );
}
