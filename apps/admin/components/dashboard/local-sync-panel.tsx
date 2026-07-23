"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ToolBrandIcon, hasToolBrandIcon } from "@/components/tools/tool-brand-icon";
import { formatRelativeTime } from "@/lib/format";
import { toolDisplayName } from "@/lib/tools/catalog";
import { cn } from "@/lib/utils";
import { useInvalidateAppData } from "@/lib/api/client";

type LocalSyncInfo =
  | {
      available: true;
      url: string;
      token: string;
      hostname: string;
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
  status?: "running" | "succeeded" | "failed" | "skipped";
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

type SnapshotRefreshResult = {
  ok?: boolean;
  dirtyDays?: number;
  rows?: number;
  dirtyRemaining?: number;
  dashboardReady?: boolean;
  error?: string;
  message?: string;
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

function formatSyncDetail(body: { warnings?: string[] }) {
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

async function refreshSnapshots(): Promise<
  { ok: true; result: SnapshotRefreshResult } | { ok: false; message: string }
> {
  try {
    const res = await fetch("/api/app/dashboard/refresh-snapshots", {
      method: "POST",
      credentials: "same-origin",
      headers: { "x-requested-with": "usejunction-web" },
    });
    const body = (await res.json().catch(() => ({}))) as {
      data?: SnapshotRefreshResult;
      error?: string;
      message?: string;
    };
    if (!res.ok) {
      return {
        ok: false,
        message: body.message ?? body.error ?? "Could not refresh dashboard snapshots.",
      };
    }
    return { ok: true, result: body.data ?? {} };
  } catch {
    return { ok: false, message: "Could not refresh dashboard snapshots." };
  }
}

export function LocalSyncPanel({
  lastSeenAt,
  lastUsageSyncAt,
  lastAccountSyncAt,
  dashboardReady,
  dirtyDayCount,
}: {
  lastSeenAt?: string | null;
  lastUsageSyncAt?: string | null;
  lastAccountSyncAt?: string | null;
  dashboardReady?: boolean;
  dirtyDayCount?: number;
}) {
  const router = useRouter();
  const invalidateAppData = useInvalidateAppData();
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<"idle" | "syncing" | "ok" | "unreachable" | "error">("idle");
  const [detail, setDetail] = useState<string | null>(null);
  const uploadedAt = latestTimestamp(lastUsageSyncAt, lastAccountSyncAt) ?? lastSeenAt;
  // Live-horizon KPIs come from usage_daily; only honor dashboardReady from the
  // server (history stub conflicts). Dirty history backlog must not block the UI.
  const ready = dashboardReady !== false;

  async function loadInfo(): Promise<LocalSyncInfo | null> {
    const res = await fetch("/api/me/local-sync", { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as LocalSyncInfo;
  }

  async function finishAfterAgentUpload(warnings?: string[]) {
    setDetail("Updating dashboard…");
    let remaining = 0;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const refresh = await refreshSnapshots();
      if (!refresh.ok) {
        setStatus("error");
        setDetail(refresh.message);
        return;
      }
      remaining = refresh.result.dirtyRemaining ?? 0;
      if (remaining === 0) break;
      setDetail(
        `Uploaded · dashboard still updating (${remaining} day${remaining === 1 ? "" : "s"} pending)…`,
      );
      await new Promise((resolve) => window.setTimeout(resolve, 1_500));
    }
    if (remaining > 0) {
      setStatus("ok");
      setDetail(
        `Uploaded · dashboard still updating (${remaining} day${remaining === 1 ? "" : "s"} pending)`,
      );
    } else {
      setStatus("ok");
      setDetail(formatSyncDetail({ warnings }) ?? "Dashboard updated");
    }
    await invalidateAppData();
    startTransition(() => router.refresh());
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
        setDetail("Local agent health check failed. Confirm the daemon is running.");
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
      const res = await fetchWithTimeout(
        url.toString(),
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${local.token}`,
            "Content-Type": "application/json",
          },
        },
        5_000,
      );
      if (!res.ok) {
        setStatus("error");
        setDetail(
          res.status === 401
            ? "Local sync token mismatch. Restart the agent daemon, then try Sync now again."
            : "Could not start local sync. Confirm the daemon is running, then try again.",
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
        setDetail("Local sync failed. Check the agent logs for details.");
        return;
      }
      if (body.debounced || body.status === "skipped") {
        // Still refresh snapshots — upload may have landed without a new collect.
        await finishAfterAgentUpload(body.warnings);
        return;
      }
      await finishAfterAgentUpload(body.warnings);
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
        res = await fetchWithTimeout(
          statusUrl.toString(),
          {
            method: "GET",
            headers: { Authorization: `Bearer ${local.token}` },
          },
          5_000,
        );
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
        setDetail(
          res.status === 401
            ? "Local sync token mismatch. Restart the agent daemon."
            : "Could not read sync status. Confirm the daemon is running.",
        );
        return;
      }
      const body = (await res.json().catch(() => ({}))) as LocalSyncJob;
      if (body.status === "running") {
        const longRunning = Date.now() - started > 45_000;
        setStatus("syncing");
        setDetail(
          `${body.message ?? "Syncing tools, plans, and usage"}${longRunning ? " · still running" : ""}`,
        );
        continue;
      }
      if (body.status === "failed") {
        setStatus("error");
        setDetail("Local sync failed. Check the agent logs for details.");
        return;
      }
      await finishAfterAgentUpload(body.warnings);
      return;
    }
  }

  const statusLabel = !ready
    ? `Uploaded ${formatRelativeTime(uploadedAt)} · updating dashboard`
    : dirtyDayCount && dirtyDayCount > 0
      ? `Last synced ${formatRelativeTime(uploadedAt)} · history still updating`
      : `Last synced ${formatRelativeTime(uploadedAt)}`;

  return (
    <div className="flex items-center justify-between gap-2 sm:gap-4">
      <div className="min-w-0">
        <p className="text-xs leading-5 text-muted-foreground sm:text-sm">{statusLabel}</p>
        {detail ? <SyncDetailLine detail={detail} status={status} /> : null}
      </div>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="min-h-11 shrink-0 px-2 sm:min-h-0 sm:px-3"
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
