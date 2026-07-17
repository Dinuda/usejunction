"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ToolBrandIcon, hasToolBrandIcon } from "@/components/tools/tool-brand-icon";
import { toolDisplayName } from "@/lib/tools/catalog";
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

type LocalSyncJob = {
  ok?: boolean;
  jobId?: string;
  status?: "running" | "succeeded" | "failed";
  step?: string;
  message?: string;
  tools?: number;
  accounts?: number;
  quotas?: number;
  usageRows?: number;
  hostname?: string;
  debounced?: boolean;
  error?: string;
  warnings?: string[];
};

type LocalAgentHealth = {
  ok?: boolean;
  syncProtocol?: number;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function isAbortError(cause: unknown) {
  return cause instanceof DOMException && cause.name === "AbortError";
}

function formatRelative(iso: string | null | undefined) {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

function latestTimestamp(...values: Array<string | null | undefined>) {
  let latest: string | null = null;
  let latestMs = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    if (!value) continue;
    const timestamp = Date.parse(value);
    if (Number.isFinite(timestamp) && timestamp > latestMs) {
      latest = value;
      latestMs = timestamp;
    }
  }
  return latest;
}

function SyncDetailLine({
  detail,
  status,
}: {
  detail: string;
  status: "idle" | "syncing" | "ok" | "unreachable" | "error";
}) {
  const { toolKey, label } = parseSyncDetail(detail);
  const showLogo = Boolean(toolKey && hasToolBrandIcon(toolKey));
  const syncing = status === "syncing";

  return (
    <p
      className={cn(
        "mt-1 flex items-center gap-1.5 text-xs",
        status === "ok" && "text-success",
        (status === "unreachable" || status === "error") && "text-destructive",
        syncing && "text-muted-foreground",
      )}
    >
      {showLogo && toolKey ? (
        <ToolBrandIcon tool={toolKey} size={12} className="shrink-0 text-muted-foreground" />
      ) : null}
      <span className={cn(syncing && "shimmer")}>{label}</span>
    </p>
  );
}

function formatSyncDetail(body: {
  warnings?: string[];
}) {
  if (!body.warnings?.length) return null;
  return `Synced with ${body.warnings.length} warning${body.warnings.length === 1 ? "" : "s"}.`;
}

const STILL_RUNNING_SUFFIX = " · still running";

function parseSyncDetail(detail: string): { toolKey: string | null; label: string } {
  const stillRunning = detail.endsWith(STILL_RUNNING_SUFFIX);
  const base = stillRunning ? detail.slice(0, -STILL_RUNNING_SUFFIX.length) : detail;
  const suffix = stillRunning ? STILL_RUNNING_SUFFIX : "";

  const scanning = /^Scanning (.+)$/i.exec(base);
  if (scanning?.[1]) {
    const toolKey = scanning[1].trim();
    return { toolKey, label: `Scanning ${toolDisplayName(toolKey)}${suffix}` };
  }

  const skipped = /^Skipped slow (.+) scan$/i.exec(base);
  if (skipped?.[1]) {
    const toolKey = skipped[1].trim();
    return { toolKey, label: `Skipped slow ${toolDisplayName(toolKey)} scan${suffix}` };
  }

  return { toolKey: null, label: detail };
}

export function LocalSyncPanel({
  lastSeenAt,
  lastUsageSyncAt,
  lastAccountSyncAt,
  stale,
}: {
  lastSeenAt?: string | null;
  lastUsageSyncAt?: string | null;
  lastAccountSyncAt?: string | null;
  stale?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<"idle" | "syncing" | "ok" | "unreachable" | "error">("idle");
  const [detail, setDetail] = useState<string | null>(null);
  const lastSuccessfulSyncAt = latestTimestamp(lastUsageSyncAt, lastAccountSyncAt) ?? lastSeenAt;

  async function loadInfo(): Promise<LocalSyncInfo | null> {
    const res = await fetch("/api/me/local-sync", { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as LocalSyncInfo;
  }

  async function syncNow() {
    setStatus("syncing");
    setDetail("Syncing…");
    let local: LocalSyncInfo | null;
    try {
      local = await loadInfo();
    } catch {
      setStatus("error");
      setDetail("Could not load local sync credentials.");
      return;
    }
    if (!local) {
      setStatus("error");
      setDetail("Could not load local sync credentials.");
      return;
    }
    if (!local.available) {
      setStatus("unreachable");
      setDetail(local.message ?? "Local agent endpoint not registered.");
      return;
    }

    try {
      const healthUrl = new URL("/health", local.url);
      const healthRes = await fetchWithTimeout(healthUrl.toString(), { method: "GET" }, 3_000);
      if (!healthRes.ok) {
        setStatus("unreachable");
        setDetail(`Local agent health check failed (${healthRes.status}). Confirm the daemon is running.`);
        return;
      }
      const health = (await healthRes.json().catch(() => ({}))) as LocalAgentHealth;
      if (health.syncProtocol !== 2) {
        setStatus("error");
        setDetail("The local agent is out of date for progress sync. Restart or reinstall the agent, then try again.");
        return;
      }

      const url = new URL("/v1/sync", local.url);
      url.searchParams.set("refresh", "1");
      const res = await fetchWithTimeout(url.toString(), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${local.token}`,
          "Content-Type": "application/json",
        },
      }, 5_000);
      if (!res.ok) {
        setStatus("error");
        setDetail(
          res.status === 401
            ? "Local sync token mismatch. Restart the agent daemon, then try Sync now again."
            : `Agent returned ${res.status}`,
        );
        return;
      }
      const body = (await res.json().catch(() => ({}))) as LocalSyncJob;
      if (body.status === "running" && body.jobId) {
        await pollJob(local, body.jobId);
        return;
      }
      if (body.status === "failed") {
        setStatus("error");
        setDetail(body.error ?? body.message ?? "Local sync failed.");
        return;
      }
      setStatus("ok");
      setDetail(formatSyncDetail({ warnings: body.warnings }));
      startTransition(() => router.refresh());
    } catch (cause) {
      setStatus("unreachable");
      setDetail(
        isAbortError(cause)
          ? "Local agent health or sync start timed out. Confirm the daemon is running, then try again."
          : "Could not contact the local agent on this machine. Confirm the daemon is running and the dashboard is open on the linked computer.",
      );
    }
  }

  async function pollJob(local: Extract<LocalSyncInfo, { available: true }>, jobId: string) {
    const started = Date.now();
    for (;;) {
      await sleep(1_500);
      const statusUrl = new URL("/v1/sync/status", local.url);
      statusUrl.searchParams.set("jobId", jobId);
      let res: Response;
      try {
        res = await fetchWithTimeout(statusUrl.toString(), {
          method: "GET",
          headers: { Authorization: `Bearer ${local.token}` },
        }, 5_000);
      } catch (cause) {
        setStatus("error");
        setDetail(
          isAbortError(cause)
            ? "Local sync is running, but status polling timed out."
            : "Lost contact with the local sync job.",
        );
        return;
      }
      if (!res.ok) {
        setStatus("error");
        setDetail(res.status === 401 ? "Local sync token mismatch. Restart the agent daemon." : `Could not read sync status (${res.status}).`);
        return;
      }
      const body = (await res.json().catch(() => ({}))) as LocalSyncJob;
      if (body.status === "running") {
        const longRunning = Date.now() - started > 45_000;
        setStatus("syncing");
        setDetail(`${body.message ?? "Syncing tools, plans, and usage"}${longRunning ? " · still running" : ""}`);
        continue;
      }
      if (body.status === "failed") {
        setStatus("error");
        setDetail(body.error ?? body.message ?? "Local sync failed.");
        return;
      }
      setStatus("ok");
      setDetail(formatSyncDetail({ warnings: body.warnings }));
      startTransition(() => router.refresh());
      return;
    }
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm text-muted-foreground">
          Last synced {formatRelative(lastSuccessfulSyncAt)}
          {stale ? " · Agent may be offline" : ""}
        </p>
        {detail ? (
          <SyncDetailLine detail={detail} status={status} />
        ) : null}
      </div>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={pending || status === "syncing"}
        onClick={syncNow}
      >
        {status === "syncing" ? (
          <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
        ) : (
          <RefreshCw className="size-3.5" />
        )}
        {status === "syncing" ? <span className="shimmer text-muted-foreground">Syncing…</span> : "Sync now"}
      </Button>
    </div>
  );
}
