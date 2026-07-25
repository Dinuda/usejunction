"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { hasToolBrandIcon, ToolLogoTile } from "@/components/tools/tool-brand-icon";
import { Panel } from "@/components/panel";
import { PlatformCommand } from "@/components/onboarding/platform-command";
import { buildPlatformInstallCommands } from "@/lib/connect-command";
import {
  hasUsageReady,
  isEnrollmentTokenStale,
  isReadyDevice,
  shouldEnterSyncWait,
  shouldServeCachedEnrollmentToken,
  type DeviceConnectSnapshot,
} from "@/lib/device-connect-state";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { canonicalToolKey } from "@/lib/tools/catalog";
import { userFacingError } from "@/lib/errors/user-facing";
import { cn } from "@/lib/utils";

const POLL_INTERVAL_MS = 2500;
const POLL_DURATION_MS = 60_000;
/** After this long in post-enroll sync, show a reassurance message (polling continues). */
const SYNC_LONG_WAIT_MS = 120_000;

type Device = DeviceConnectSnapshot;

type EnrollmentCredentials = {
  token: string;
  controlPlaneUrl: string;
  expiresAt: string;
};

type Props = {
  title?: string;
  description?: string;
  footerDescription?: string;
  compact?: boolean;
  /** Only poll for enrollment after the connect command is copied. */
  pollAfterCopy?: boolean;
  /** Hide the inline waiting row (e.g. when parent renders status elsewhere). */
  hideInlineStatus?: boolean;
  onPollingStateChange?: (state: {
    isPolling: boolean;
    waitingForTools: boolean;
    /** Device row exists — user should not re-run enroll command. */
    deviceEnrolled: boolean;
    /** Post-enroll sync is taking longer than usual (informational only). */
    syncTakingLong: boolean;
  }) => void;
  onConnected?: (device: Device) => void;
};

export type DeviceConnectCardHandle = {
  checkConnection: () => void;
};

function clearEnrollmentCredentials(
  setToken: (value: string | null) => void,
  setExpiresAt: (value: string | null) => void,
  setControlPlaneUrl: (value: string) => void,
) {
  setToken(null);
  setExpiresAt(null);
  setControlPlaneUrl("");
}

export const DeviceConnectCard = forwardRef<DeviceConnectCardHandle, Props>(function DeviceConnectCard(
  {
    title = "Connect command",
    description = "Choose this device's platform, then run the command. It installs the agent, enables reporting, and starts it in the background. Expires in 15 minutes.",
    footerDescription,
    compact = false,
    pollAfterCopy = false,
    hideInlineStatus = false,
    onPollingStateChange,
    onConnected,
  },
  ref,
) {
  const [device, setDevice] = useState<Device | null>(null);
  const [knownIds, setKnownIds] = useState<Set<string>>(new Set());
  const [token, setToken] = useState<string | null>(null);
  const [controlPlaneUrl, setControlPlaneUrl] = useState("");
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [waitingForTools, setWaitingForTools] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const [pollSession, setPollSession] = useState(0);
  const [importProgress, setImportProgress] = useState<string | null>(null);
  const [syncTakingLong, setSyncTakingLong] = useState(false);
  /** Device row exists — enrollment token must not be reused. */
  const [deviceEnrolled, setDeviceEnrolled] = useState(false);
  /** Only flip after onConnected — keeps loading UI until the parent can take over. */
  const [fullyConnected, setFullyConnected] = useState(false);
  const notifiedRef = useRef<string | null>(null);
  const refreshInFlightRef = useRef<Promise<EnrollmentCredentials | null> | null>(null);
  const waitingStartedAtRef = useRef<number | null>(null);
  const initializedRef = useRef(false);

  const markEnrollmentConsumed = useCallback(() => {
    setDeviceEnrolled((current) => {
      if (current) return current;
      clearEnrollmentCredentials(setToken, setExpiresAt, setControlPlaneUrl);
      return true;
    });
  }, []);

  const beginSyncWait = useCallback((candidate: Device, progress: string | null = null) => {
    if (!waitingStartedAtRef.current) waitingStartedAtRef.current = Date.now();
    setWaitingForTools(true);
    setDevice(candidate);
    setImportProgress(progress);
    setSyncTakingLong(false);
  }, []);

  const markConnected = useCallback(
    (candidate: Device) => {
      setWaitingForTools(false);
      setIsPolling(false);
      setImportProgress(null);
      setSyncTakingLong(false);
      waitingStartedAtRef.current = null;
      setFullyConnected(true);
      if (notifiedRef.current !== candidate.id) {
        notifiedRef.current = candidate.id;
        onConnected?.(candidate);
      }
    },
    [onConnected],
  );

  const refreshStatus = useCallback(async () => {
    const response = await fetch("/api/onboarding?include=developer", { cache: "no-store" });
    if (!response.ok) return null;
    const data = await response.json();
    const devices = (data.developer?.devices as Device[] | undefined) ?? [];
    const next = devices[0] ?? null;
    setDevice(next);
    return { next, devices };
  }, []);

  const checkEnrollment = useCallback(async () => {
    const status = await refreshStatus();
    const devices = status?.devices ?? [];
    const fresh = devices.find((item) => !knownIds.has(item.id)) ?? null;
    const candidate = fresh ?? devices.find((item) => item.id === device?.id) ?? status?.next ?? null;

    if (candidate) {
      markEnrollmentConsumed();
    }

    if (candidate && !knownIds.has(candidate.id)) {
      setKnownIds(new Set(devices.map((item) => item.id)));
    }

    if (candidate && !isReadyDevice(candidate)) {
      beginSyncWait(candidate);
      return;
    }

    if (candidate && isReadyDevice(candidate) && !hasUsageReady(candidate)) {
      beginSyncWait(candidate, "Waiting for first usage upload…");
      return;
    }

    if (candidate && isReadyDevice(candidate) && hasUsageReady(candidate)) {
      setDevice(candidate);
      try {
        const ctxRes = await fetch("/api/app/workspace-context", { cache: "no-store" });
        if (ctxRes.ok) {
          const ctx = (await ctxRes.json()) as {
            data?: { sync?: { dashboardReady?: boolean; dirtyDayCount?: number } };
          };
          const sync = ctx.data?.sync;
          if (sync && (sync.dashboardReady === false || (sync.dirtyDayCount ?? 0) > 0)) {
            beginSyncWait(
              candidate,
              sync.dirtyDayCount && sync.dirtyDayCount > 0
                ? `Preparing dashboard… (${sync.dirtyDayCount} day${sync.dirtyDayCount === 1 ? "" : "s"} importing)`
                : "Preparing dashboard…",
            );
            return;
          }
        }
      } catch {
        // Soft-fail: proceed with upload-ready if readiness probe fails.
      }
      markConnected(candidate);
      return;
    }

    if (candidate && isReadyDevice(candidate)) {
      setDevice(candidate);
      markConnected(candidate);
    }
  }, [beginSyncWait, device?.id, knownIds, markConnected, markEnrollmentConsumed, refreshStatus]);

  const generateToken = useCallback(async (rotate = false): Promise<EnrollmentCredentials | null> => {
    if (deviceEnrolled) {
      setError("This device is already enrolled. Wait for sync to finish.");
      return null;
    }

    setError(null);
    const bootstrap = await fetch("/api/onboarding", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json", "x-requested-with": "usejunction-web" },
      body: "{}",
    });
    if (bootstrap.status === 401) {
      window.location.href = "/login?from=/onboarding";
      return null;
    }
    if (!bootstrap.ok) {
      const data = await bootstrap.json().catch(() => ({}));
      setError(userFacingError(data.error, "Unable to prepare your workspace."));
      return null;
    }

    const response = await fetch("/api/me/enrollment-token", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "content-type": "application/json",
        "x-requested-with": "usejunction-web",
      },
      body: JSON.stringify({ rotate }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(userFacingError(data.error, "Unable to create a connect command."));
      return null;
    }

    const credentials: EnrollmentCredentials = {
      token: data.token,
      expiresAt: data.expiresAt,
      controlPlaneUrl: data.controlPlaneUrl || window.location.origin,
    };
    setToken(credentials.token);
    setExpiresAt(credentials.expiresAt);
    setControlPlaneUrl(credentials.controlPlaneUrl);
    return credentials;
  }, [deviceEnrolled]);

  const ensureFreshEnrollment = useCallback(async (): Promise<EnrollmentCredentials | null> => {
    if (
      shouldServeCachedEnrollmentToken({
        token,
        controlPlaneUrl,
        expiresAt,
        enrollmentConsumed: deviceEnrolled,
      })
    ) {
      return { token: token!, controlPlaneUrl, expiresAt: expiresAt! };
    }

    if (deviceEnrolled) {
      return null;
    }

    if (refreshInFlightRef.current) return refreshInFlightRef.current;

    const pending = generateToken().finally(() => {
      refreshInFlightRef.current = null;
    });
    refreshInFlightRef.current = pending;
    return pending;
  }, [controlPlaneUrl, deviceEnrolled, expiresAt, generateToken, token]);

  const resolveCommandForCopy = useCallback(
    async (platform: "macosLinux" | "windows") => {
      const credentials = await ensureFreshEnrollment();
      if (!credentials) {
        throw new Error(
          deviceEnrolled
            ? "Device already enrolled — wait for sync to finish."
            : "Unable to refresh connect command.",
        );
      }
      return buildPlatformInstallCommands(credentials.token, credentials.controlPlaneUrl)[platform];
    },
    [deviceEnrolled, ensureFreshEnrollment],
  );

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    void (async () => {
      const status = await refreshStatus();
      const devices = status?.devices ?? [];
      setKnownIds(new Set(devices.map((item) => item.id)));
      const existing = status?.next ?? null;

      if (existing) {
        markEnrollmentConsumed();
        setDevice(existing);
        if (shouldEnterSyncWait(existing)) {
          beginSyncWait(existing);
        }
      } else {
        await generateToken();
      }

      setLoading(false);
    })();
  }, [beginSyncWait, generateToken, markEnrollmentConsumed, refreshStatus]);

  useEffect(() => {
    if (fullyConnected) return;
    const waitForCopy = pollAfterCopy && pollSession === 0 && !deviceEnrolled;
    if (waitForCopy) return;

    void checkEnrollment();
    const interval = window.setInterval(() => void checkEnrollment(), POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [checkEnrollment, deviceEnrolled, fullyConnected, pollAfterCopy, pollSession]);

  useEffect(() => {
    if (!pollAfterCopy || pollSession === 0 || deviceEnrolled) return;

    setIsPolling(true);
    const timeout = window.setTimeout(() => {
      setIsPolling(false);
      if (device && isReadyDevice(device) && notifiedRef.current !== device.id) {
        markConnected(device);
      }
    }, POLL_DURATION_MS);

    return () => window.clearTimeout(timeout);
  }, [device, deviceEnrolled, markConnected, pollAfterCopy, pollSession]);

  /** Informational only — never reset to re-enroll after a device exists. */
  useEffect(() => {
    if (!waitingForTools || fullyConnected) return;

    const startedAt = waitingStartedAtRef.current ?? Date.now();
    waitingStartedAtRef.current = startedAt;
    const remaining = Math.max(0, SYNC_LONG_WAIT_MS - (Date.now() - startedAt));

    const timeout = window.setTimeout(() => setSyncTakingLong(true), remaining);
    return () => window.clearTimeout(timeout);
  }, [fullyConnected, waitingForTools]);

  const handleCopied = useCallback(() => {
    if (!pollAfterCopy) return;
    setPollSession((current) => current + 1);
  }, [pollAfterCopy]);

  const checkConnection = useCallback(() => {
    if (deviceEnrolled) {
      void checkEnrollment();
      return;
    }
    if (!pollAfterCopy || isReadyDevice(device)) return;
    setPollSession((current) => current + 1);
  }, [checkEnrollment, device, deviceEnrolled, pollAfterCopy]);

  useImperativeHandle(ref, () => ({ checkConnection }), [checkConnection]);

  useEffect(() => {
    onPollingStateChange?.({
      isPolling,
      waitingForTools,
      deviceEnrolled,
      syncTakingLong,
    });
  }, [deviceEnrolled, isPolling, onPollingStateChange, syncTakingLong, waitingForTools]);

  const commands = useMemo(() => {
    if (deviceEnrolled || !token || !controlPlaneUrl) return null;
    return buildPlatformInstallCommands(token, controlPlaneUrl);
  }, [controlPlaneUrl, deviceEnrolled, token]);

  if (loading) {
    return (
      <Panel padded={false} className="flex items-center gap-3 border-border px-4 py-5 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin text-primary" />
        Checking device…
      </Panel>
    );
  }

  if (fullyConnected && device && isReadyDevice(device)) {
    const connectedTools = [
      ...new Set((device.toolInstallations ?? []).map((tool) => canonicalToolKey(tool.toolName)).filter(hasToolBrandIcon)),
    ];
    return (
      <Panel padded={false} className="border-border p-4">
        <p className="font-mono text-[0.65rem] uppercase tracking-[0.14em] text-primary">Connected</p>
        <p className="mt-2 text-sm font-medium">{device.hostname}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {device.os} · last seen {new Date(device.lastSeenAt).toLocaleString()}
        </p>
        {connectedTools.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {connectedTools.map((toolKey) => (
              <ToolLogoTile key={toolKey} tool={toolKey} size="sm" />
            ))}
          </div>
        )}
      </Panel>
    );
  }

  const expired = isEnrollmentTokenStale(expiresAt);
  const showWaiting = pollAfterCopy ? isPolling && !deviceEnrolled : !deviceEnrolled;
  const showStatusRow = !hideInlineStatus && (showWaiting || expired);
  const enrolledAwaitingTools = waitingForTools && Boolean(device) && !fullyConnected;

  return (
    <div className={cn(compact ? "space-y-0" : "space-y-4")}>
      {!compact && !enrolledAwaitingTools && (
        <div>
          <p className="text-sm font-medium">{title}</p>
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        </div>
      )}
      {enrolledAwaitingTools ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
            <Check className="size-4 shrink-0" aria-hidden />
            <span>
              {importProgress ??
                (hasUsageReady(device)
                  ? "Device enrolled — preparing dashboard…"
                  : "Device enrolled — waiting for tool detection…")}
            </span>
            <Loader2 className="size-4 shrink-0 animate-spin opacity-80" aria-hidden />
          </div>
          {syncTakingLong ? (
            <p className="text-xs leading-relaxed text-muted-foreground">
              Still working — your agent may be scanning local AI tools. First connect can take several minutes.
              Leave this page open or check back shortly.
            </p>
          ) : null}
        </div>
      ) : (
        <>
          {commands ? (
            <PlatformCommand
              commands={commands}
              resolveCommandForCopy={resolveCommandForCopy}
              onCopied={handleCopied}
              footerDescription={footerDescription}
            />
          ) : deviceEnrolled ? null : (
            <div className="border border-brand-olive bg-brand-olive p-4 font-mono text-xs text-primary-foreground">
              Preparing commands…
            </div>
          )}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {showStatusRow ? (
            <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
              {showWaiting ? (
                <div className="flex w-full items-center justify-between gap-3 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Loader2 className="size-4 animate-spin text-primary" />
                    Waiting for enroll…
                  </div>
                  {!expired ? (
                    <span className="shrink-0 font-mono text-[0.65rem]">Expires in 15 minutes</span>
                  ) : null}
                </div>
              ) : (
                <div />
              )}
              {expired && !deviceEnrolled ? (
                <Button variant="outline" size="sm" onClick={() => void generateToken(true)}>
                  Refresh expired command
                </Button>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
});
