"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatRelativeTime } from "@/lib/format";
import { DEVICE_STALE_AFTER_MS } from "@/lib/devices/health";
import { browserMutationInit, useInvalidateAppData } from "@/lib/api/client";
import { cn } from "@/lib/utils";

type SyncScope = "team" | "you";
type PanelStatus = "idle" | "syncing" | "ok" | "unreachable" | "error";

type RemoteSyncRequest = {
  id: string;
  scope: SyncScope;
  createdAt: string;
  expiresAt: string;
  dispatchStatus: string;
  dispatchError: string | null;
  totals: {
    total: number;
    waiting: number;
    accepted: number;
    running: number;
    active: number;
    succeeded: number;
    failed: number;
    expired: number;
    done: number;
    pending: number;
  };
  targets: Array<{
    id: string;
    status: string;
    device: {
      hostname: string;
      remoteSyncProtocol: number;
      online: boolean;
    };
  }>;
};

type SnapshotRefreshResult = {
  ok?: boolean;
  dirtyRemaining?: number;
  error?: string;
  message?: string;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

async function refreshSnapshots(): Promise<
  { ok: true; result: SnapshotRefreshResult } | { ok: false; message: string }
> {
  try {
    const res = await fetch("/api/app/dashboard/refresh-snapshots", browserMutationInit("POST"));
    const body = (await res.json().catch(() => ({}))) as {
      data?: SnapshotRefreshResult;
      error?: { message?: string };
      message?: string;
    };
    if (!res.ok) {
      return {
        ok: false,
        message: body.message ?? body.error?.message ?? "Could not refresh dashboard snapshots.",
      };
    }
    return { ok: true, result: body.data ?? {} };
  } catch {
    return { ok: false, message: "Could not refresh dashboard snapshots." };
  }
}

async function appJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    cache: "no-store",
    credentials: "same-origin",
    ...init,
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "x-requested-with": "usejunction-web",
      ...(init?.headers ?? {}),
    },
  });
  const body = (await response.json().catch(() => null)) as
    | { data?: T; error?: { message?: string } }
    | null;
  if (!response.ok || !body || !("data" in body)) {
    throw new Error(body?.error?.message ?? "Sync request failed.");
  }
  return body.data as T;
}

function historyProgressLabel(days: number) {
  return `updating history (${days} day${days === 1 ? "" : "s"} remaining)`;
}

/** Avoid flashing history status for sub-second dirty spikes from in-flight agent sync. */
const HISTORY_STATUS_DEBOUNCE_MS = 1_200;

function requestIsActive(request: RemoteSyncRequest | null) {
  if (!request) return false;
  return request.totals.pending > 0 && Date.parse(request.expiresAt) > Date.now();
}

function syncDetail(request: RemoteSyncRequest | null, scope: SyncScope) {
  if (!request) {
    return null;
  }
  const total = request.totals.total;
  const unsupported = request.targets.filter(
    (target) => target.status === "queued" && target.device.remoteSyncProtocol < 1,
  ).length;
  if (request.dispatchStatus === "degraded") {
    return `Requested ${total} ${total === 1 ? "device" : "devices"} - realtime wake degraded; agents will claim on heartbeat.`;
  }
  if (request.totals.pending > 0) {
    const waiting = request.totals.waiting;
    const active = request.totals.active;
    const subject = scope === "team" ? "team devices" : "your devices";
    const updateText = unsupported > 0 ? ` - ${unsupported} waiting for agent update` : "";
    return `Requested ${total} ${subject} - ${active} accepted/running, ${waiting} waiting${updateText}`;
  }
  if (request.totals.failed > 0) {
    return `${request.totals.succeeded}/${total} devices synced - ${request.totals.failed} failed.`;
  }
  if (request.totals.expired > 0) {
    return `${request.totals.succeeded}/${total} devices synced - ${request.totals.expired} expired.`;
  }
  return `${total} ${total === 1 ? "device" : "devices"} synced.`;
}

function SyncDetailLine({
  detail,
  status,
}: {
  detail: string;
  status: PanelStatus;
}) {
  const syncing = status === "syncing";
  return (
    <p
      className={cn(
        "mt-1 text-xs sm:text-sm",
        status === "ok" && "text-success",
        (status === "unreachable" || status === "error") && "text-destructive",
        syncing && "text-muted-foreground",
      )}
    >
      <span className={cn(syncing && "shimmer")}>{detail}</span>
    </p>
  );
}

export function LocalSyncPanel({
  scope = "you",
  lastSeenAt,
  lastUsageSyncAt,
  lastAccountSyncAt,
  dashboardReady,
  dirtyDayCount,
  staleDeviceCount,
}: {
  scope?: SyncScope;
  lastSeenAt?: string | null;
  lastUsageSyncAt?: string | null;
  lastAccountSyncAt?: string | null;
  dashboardReady?: boolean;
  dirtyDayCount?: number;
  staleDeviceCount?: number;
}) {
  const router = useRouter();
  const invalidateAppData = useInvalidateAppData();
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<PanelStatus>("idle");
  const [request, setRequest] = useState<RemoteSyncRequest | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [pendingDays, setPendingDays] = useState(dirtyDayCount ?? 0);
  const [historyStatusVisible, setHistoryStatusVisible] = useState(false);
  const lastSucceededRef = useRef(0);
  const drainingRef = useRef(false);
  const healthReconcileRef = useRef(false);
  const storageKey = useMemo(() => `usejunction:last-sync-request:${scope}`, [scope]);
  const uploadedAt = latestTimestamp(lastUsageSyncAt, lastAccountSyncAt) ?? lastSeenAt;
  const staleCount = staleDeviceCount ?? (
    lastSeenAt != null && Date.now() - Date.parse(lastSeenAt) > DEVICE_STALE_AFTER_MS ? 1 : 0
  );
  const ready = dashboardReady !== false;
  const historyPending = pendingDays > 0;

  const refreshAppData = useCallback(async () => {
    if (drainingRef.current) return;
    drainingRef.current = true;
    try {
      let remaining = 0;
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const refresh = await refreshSnapshots();
        if (!refresh.ok) {
          setStatus("error");
          setDetail(refresh.message);
          return;
        }
        remaining = refresh.result.dirtyRemaining ?? 0;
        setPendingDays(remaining);
        if (remaining === 0) break;
        await sleep(1_500);
      }
      await invalidateAppData();
      startTransition(() => router.refresh());
    } finally {
      drainingRef.current = false;
    }
  }, [invalidateAppData, router]);

  const loadRequest = useCallback(
    async (id: string) => {
      const next = await appJson<RemoteSyncRequest>(`/api/app/sync-requests/${encodeURIComponent(id)}`);
      setRequest(next);
      if (next.totals.succeeded > lastSucceededRef.current) {
        lastSucceededRef.current = next.totals.succeeded;
        void refreshAppData();
      }
      if (requestIsActive(next)) {
        setStatus("syncing");
      } else if (next.totals.failed > 0 || next.dispatchStatus === "degraded") {
        setStatus(next.totals.succeeded > 0 ? "ok" : "error");
      } else {
        setStatus("ok");
      }
      setDetail(syncDetail(next, scope));
      if (!requestIsActive(next)) {
        localStorage.removeItem(storageKey);
      }
      return next;
    },
    [refreshAppData, scope, storageKey],
  );

  useEffect(() => {
    setPendingDays(dirtyDayCount ?? 0);
  }, [dirtyDayCount]);

  // Keep "updating history" off the status line unless dirty days persist past a short debounce.
  // Matches navigate-away behavior: remounts with clean server state show nothing.
  useEffect(() => {
    if (!historyPending) {
      setHistoryStatusVisible(false);
      return;
    }
    const timer = window.setTimeout(() => {
      setHistoryStatusVisible(true);
    }, HISTORY_STATUS_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [historyPending]);

  useEffect(() => {
    if (staleCount <= 0 || healthReconcileRef.current) return;
    healthReconcileRef.current = true;
    void fetch("/api/app/device-health/reconcile", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "x-requested-with": "usejunction-web",
      },
      body: JSON.stringify({ scope }),
    }).catch(() => undefined);
  }, [scope, staleCount]);

  useEffect(() => {
    const id = localStorage.getItem(storageKey);
    if (!id) return;
    let cancelled = false;
    loadRequest(id).catch(() => {
      if (!cancelled) localStorage.removeItem(storageKey);
    });
    return () => {
      cancelled = true;
    };
  }, [loadRequest, storageKey]);

  useEffect(() => {
    if (!request || !requestIsActive(request)) return;
    const activeRequest = request;
    let cancelled = false;
    const delay = activeRequest.totals.active > 0 ? 1_000 : 30_000;
    const timer = window.setTimeout(() => {
      if (!cancelled) void loadRequest(activeRequest.id).catch(() => undefined);
    }, delay);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [loadRequest, request]);

  useEffect(() => {
    if (!request || !requestIsActive(request)) return;
    const activeRequest = request;
    const onFocus = () => {
      void loadRequest(activeRequest.id).catch(() => undefined);
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [loadRequest, request]);

  useEffect(() => {
    if (!historyPending || status === "syncing" || drainingRef.current) return;
    // Same debounce as status visibility: settle often clears dirty days before we drain.
    const timer = window.setTimeout(() => {
      if (!drainingRef.current) void refreshAppData();
    }, HISTORY_STATUS_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [historyPending, refreshAppData, status]);

  async function syncNow() {
    setStatus("syncing");
    setDetail(scope === "team" ? "Requesting team sync..." : "Requesting sync for your devices...");
    try {
      const created = await appJson<RemoteSyncRequest>("/api/app/sync-requests", {
        method: "POST",
        body: JSON.stringify({
          scope,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      lastSucceededRef.current = created.totals.succeeded;
      setRequest(created);
      setDetail(syncDetail(created, scope));
      if (requestIsActive(created)) {
        localStorage.setItem(storageKey, created.id);
      } else {
        localStorage.removeItem(storageKey);
        setStatus(created.totals.failed > 0 ? "error" : "ok");
      }
    } catch (error) {
      setStatus("error");
      setDetail(error instanceof Error ? error.message : "Could not request sync.");
    }
  }

  // Prefer day-count while history is draining. Without this, dirtyDayCount > 0 always
  // sets dashboardReady=false, so the "updating dashboard" branch hid progress forever and
  // the only place the day count appeared was a stale detail line (the prod ghost).
  const statusLabel = historyStatusVisible
    ? `Uploaded ${formatRelativeTime(uploadedAt)} - ${historyProgressLabel(pendingDays)}`
    : !ready
      ? `Uploaded ${formatRelativeTime(uploadedAt)} - updating dashboard`
      : `Last synced ${formatRelativeTime(uploadedAt)}`;
  const visibleDetail = detail ?? syncDetail(request, scope);
  const buttonText = status === "syncing" ? "Syncing..." : scope === "team" ? "Sync team" : "Sync now";

  return (
    <div className="flex items-center justify-between gap-2 sm:gap-4">
      <div className="min-w-0">
        <p className="text-xs leading-5 text-muted-foreground sm:text-sm">{statusLabel}</p>
        {visibleDetail ? <SyncDetailLine detail={visibleDetail} status={status} /> : null}
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
        {status === "syncing" ? <span className="shimmer text-muted-foreground">{buttonText}</span> : buttonText}
      </Button>
    </div>
  );
}
