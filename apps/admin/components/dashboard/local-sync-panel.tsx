"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type LocalSyncInfo =
  | {
      available: true;
      url: string;
      token: string;
      hostname: string;
      online: boolean;
      lastSeenAt: string;
      lastUsageSyncAt: string | null;
      lastAccountSyncAt: string | null;
    }
  | {
      available: false;
      reason?: string;
      message?: string;
    };

function formatRelative(iso: string | null | undefined) {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

function formatSyncDetail(body: {
  debounced?: boolean;
  accounts?: number;
  usageRows?: number;
  hostname: string;
}) {
  if (body.debounced) return "Already synced recently.";
  const parts: string[] = [];
  if ((body.accounts ?? 0) > 0) {
    parts.push(`${body.accounts} plan account${body.accounts === 1 ? "" : "s"}`);
  }
  if ((body.usageRows ?? 0) > 0) {
    parts.push(`${body.usageRows} usage row${body.usageRows === 1 ? "" : "s"}`);
  }
  if (parts.length === 0) {
    return `Synced tools and plans from ${body.hostname}.`;
  }
  return `Synced ${parts.join(" and ")} from ${body.hostname}.`;
}

export function LocalSyncPanel({
  lastSeenAt,
  lastUsageSyncAt,
  lastAccountSyncAt,
  stale,
  autoAttempt = false,
  needsPlanSync = false,
}: {
  lastSeenAt?: string | null;
  lastUsageSyncAt?: string | null;
  lastAccountSyncAt?: string | null;
  stale?: boolean;
  autoAttempt?: boolean;
  needsPlanSync?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<"idle" | "syncing" | "ok" | "unreachable" | "error">("idle");
  const [detail, setDetail] = useState<string | null>(null);
  const [info, setInfo] = useState<LocalSyncInfo | null>(null);

  const planFreshness = lastAccountSyncAt ?? lastUsageSyncAt;

  async function loadInfo(): Promise<LocalSyncInfo | null> {
    const res = await fetch("/api/me/local-sync", { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as LocalSyncInfo;
  }

  async function bounce(opts: { refresh: boolean; timeoutMs: number }) {
    setStatus("syncing");
    setDetail("Syncing tools, plans, and usage…");
    const local = info ?? (await loadInfo());
    if (!local) {
      setStatus("error");
      setDetail("Could not load local sync credentials.");
      return;
    }
    setInfo(local);
    if (!local.available) {
      setStatus("unreachable");
      setDetail(local.message ?? "Local agent endpoint not registered.");
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
    try {
      const url = new URL("/v1/sync", local.url);
      if (opts.refresh) url.searchParams.set("refresh", "1");
      const res = await fetch(url.toString(), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${local.token}`,
          "Content-Type": "application/json",
        },
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) {
        setStatus("error");
        setDetail(`Agent returned ${res.status}`);
        return;
      }
      const body = await res.json().catch(() => ({}));
      setStatus("ok");
      setDetail(
        formatSyncDetail({
          debounced: body.debounced,
          accounts: body.accounts,
          usageRows: body.usageRows,
          hostname: local.hostname,
        }),
      );
      startTransition(() => router.refresh());
    } catch {
      clearTimeout(timer);
      setStatus("unreachable");
      setDetail(
        "Could not reach the local agent. Open this dashboard on your linked machine with the daemon running.",
      );
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const local = await loadInfo();
      if (cancelled || !local) return;
      setInfo(local);
      if (autoAttempt && local.available) {
        if (needsPlanSync) {
          await bounce({ refresh: true, timeoutMs: 30_000 });
        } else {
          await bounce({ refresh: false, timeoutMs: 2000 });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // Intentionally once on mount for silent bounce.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoAttempt, needsPlanSync]);

  return (
    <div className="flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">Sync</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Last seen {formatRelative(lastSeenAt)}
          {" · "}
          Plans {formatRelative(planFreshness)}
          {" · "}
          Usage {formatRelative(lastUsageSyncAt)}
          {stale ? " · Agent may be offline" : ""}
        </p>
        {detail ? (
          <p
            className={cn(
              "mt-1 text-xs",
              status === "ok" && "text-success",
              (status === "unreachable" || status === "error") && "text-destructive",
              status === "syncing" && "text-muted-foreground",
            )}
          >
            {detail}
          </p>
        ) : null}
      </div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={pending || status === "syncing"}
        onClick={() => bounce({ refresh: true, timeoutMs: 30_000 })}
      >
        {status === "syncing" ? "Syncing…" : "Sync now"}
      </Button>
    </div>
  );
}
