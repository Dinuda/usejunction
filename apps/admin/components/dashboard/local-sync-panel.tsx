"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PlatformCommand } from "@/components/onboarding/platform-command";
import { formatRelativeTime } from "@/lib/format";
import { DEVICE_STALE_AFTER_MS } from "@/lib/devices/health";
import { useInvalidateAppData } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { buildPlatformResumeCommands } from "@/lib/connect-command";
import type { DeviceRecoverySummary } from "@/lib/sync/remote-sync";

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
    const res = await fetch("/api/app/dashboard/refresh-snapshots", {
      method: "POST",
      credentials: "same-origin",
      headers: { "x-requested-with": "usejunction-web" },
    });
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

function requestIsActive(request: RemoteSyncRequest | null) {
  if (!request) return false;
  return request.totals.pending > 0 && Date.parse(request.expiresAt) > Date.now();
}

function syncDetail(request: RemoteSyncRequest | null, scope: SyncScope, pendingDays: number) {
  if (!request) {
    return pendingDays > 0 ? `Uploaded - ${historyProgressLabel(pendingDays)}` : null;
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
  recoveryDevices: recoveryDevicesProp,
}: {
  scope?: SyncScope;
  lastSeenAt?: string | null;
  lastUsageSyncAt?: string | null;
  lastAccountSyncAt?: string | null;
  dashboardReady?: boolean;
  dirtyDayCount?: number;
  staleDeviceCount?: number;
  recoveryDevices?: DeviceRecoverySummary[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const invalidateAppData = useInvalidateAppData();
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<PanelStatus>("idle");
  const [request, setRequest] = useState<RemoteSyncRequest | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [repairDevice, setRepairDevice] = useState<DeviceRecoverySummary | null>(null);
  const [pendingDays, setPendingDays] = useState(dirtyDayCount ?? 0);
  const lastSucceededRef = useRef(0);
  const drainingRef = useRef(false);
  const healthReconcileRef = useRef(false);
  const storageKey = useMemo(() => `usejunction:last-sync-request:${scope}`, [scope]);
  const uploadedAt = latestTimestamp(lastUsageSyncAt, lastAccountSyncAt) ?? lastSeenAt;
  const recoveryDevices = recoveryDevicesProp ?? [];
  const staleCount = staleDeviceCount ?? (
    lastSeenAt != null && Date.now() - Date.parse(lastSeenAt) > DEVICE_STALE_AFTER_MS ? 1 : 0
  );
  const ready = dashboardReady !== false;
  const historyPending = pendingDays > 0;

  useEffect(() => {
    const requestedId = searchParams.get("repair");
    if (!requestedId || repairDevice || recoveryDevices.length === 0) return;
    const requested = recoveryDevices.find((device) => device.id === requestedId);
    if (requested) setRepairDevice(requested);
  }, [recoveryDevices, repairDevice, searchParams]);

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
        setDetail(`Uploaded - ${historyProgressLabel(remaining)}`);
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
      setDetail(syncDetail(next, scope, pendingDays));
      if (!requestIsActive(next)) {
        localStorage.removeItem(storageKey);
      }
      return next;
    },
    [pendingDays, refreshAppData, scope, storageKey],
  );

  useEffect(() => {
    setPendingDays(dirtyDayCount ?? 0);
  }, [dirtyDayCount]);

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
    void refreshAppData();
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
      setDetail(syncDetail(created, scope, pendingDays));
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

  const statusLabel = !ready
    ? `Uploaded ${formatRelativeTime(uploadedAt)} - updating dashboard`
    : historyPending
      ? `Uploaded ${formatRelativeTime(uploadedAt)} - ${historyProgressLabel(pendingDays)}`
      : `Last synced ${formatRelativeTime(uploadedAt)}`;
  const visibleDetail = detail ?? syncDetail(request, scope, pendingDays);
  const buttonText = status === "syncing" ? "Syncing..." : scope === "team" ? "Sync team" : "Sync now";
  const ownedRecoveryDevice = recoveryDevices.find((device) => device.isCurrentUser) ?? null;
  const canRepairFromHere = scope === "you" || Boolean(ownedRecoveryDevice);

  return (
    <div className="flex items-center justify-between gap-2 sm:gap-4">
      <div className="min-w-0">
        <p className="text-xs leading-5 text-muted-foreground sm:text-sm">{statusLabel}</p>
        {recoveryDevices.length > 0 ? (
          <div className="mt-3 flex flex-col gap-3 border border-amber-500/30 bg-amber-500/10 px-3 py-3 text-sm text-amber-800 dark:text-amber-200 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-2">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
              <div className="min-w-0">
                <p className="font-medium">
                  {canRepairFromHere
                    ? "Connection needs attention."
                    : `${recoveryDevices.length} machine${recoveryDevices.length === 1 ? "" : "s"} need${recoveryDevices.length === 1 ? "s" : ""} attention.`}
                </p>
                <p className="mt-0.5 text-xs text-amber-800/80 dark:text-amber-200/80">
                  {canRepairFromHere
                    ? `${ownedRecoveryDevice?.hostname ?? recoveryDevices[0]?.hostname ?? "This machine"} has not reported for 2 days.`
                    : "The machine owner has been notified to repair the existing agent enrollment."}
                </p>
              </div>
            </div>
            {canRepairFromHere ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="shrink-0 border-amber-500/40 bg-background text-foreground hover:bg-amber-500/10"
                onClick={() => setRepairDevice(ownedRecoveryDevice ?? recoveryDevices[0] ?? null)}
              >
                Repair connection
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="shrink-0 border-amber-500/40 bg-background text-foreground hover:bg-amber-500/10"
                onClick={() => router.push("/team")}
              >
                Review machines
              </Button>
            )}
          </div>
        ) : null}
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
      <Dialog open={Boolean(repairDevice)} onOpenChange={(open) => !open && setRepairDevice(null)}>
        <DialogContent className="max-w-xl gap-5 sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Repair connection.</DialogTitle>
            <DialogDescription>
              Run this command on {repairDevice?.hostname ?? "the affected machine"}. It preserves the existing enrollment and restarts the agent.
            </DialogDescription>
          </DialogHeader>
          {repairDevice ? (
            <PlatformCommand
              commands={buildPlatformResumeCommands(typeof window !== "undefined" ? window.location.origin : "")}
              footerDescription="Your device history stays attached to this machine. The command does not create another device."
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
