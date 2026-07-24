"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { hasToolBrandIcon, ToolLogoTile } from "@/components/tools/tool-brand-icon";
import { Panel } from "@/components/panel";
import { PlatformCommand } from "@/components/onboarding/platform-command";
import { buildPlatformInstallCommands } from "@/lib/connect-command";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { canonicalToolKey } from "@/lib/tools/catalog";
import { userFacingError } from "@/lib/errors/user-facing";
import { cn } from "@/lib/utils";

const POLL_INTERVAL_MS = 2500;
const POLL_DURATION_MS = 60_000;

type Device = {
  id: string;
  hostname: string;
  os: string;
  lastSeenAt: string;
  lastUsageSyncAt?: string | null;
  toolInstallations?: Array<{ toolName: string; version?: string | null }>;
};

type EnrollmentCredentials = {
  token: string;
  controlPlaneUrl: string;
  expiresAt: string;
};

function isEnrollmentTokenStale(expiresAt: string | null | undefined) {
  if (!expiresAt) return true;
  return new Date(expiresAt).getTime() <= Date.now();
}

type Props = {
  title?: string;
  description?: string;
  footerDescription?: string;
  compact?: boolean;
  /** Only poll for enrollment after the connect command is copied. */
  pollAfterCopy?: boolean;
  /** Hide the inline waiting row (e.g. when parent renders status elsewhere). */
  hideInlineStatus?: boolean;
  onPollingStateChange?: (state: { isPolling: boolean; waitingForTools: boolean }) => void;
  onConnected?: (device: Device) => void;
};

export type DeviceConnectCardHandle = {
  checkConnection: () => void;
};

/** Device is ready once enrolled, tools reported, and first usage sync landed (or timed out waiting). */
function isReadyDevice(device: Device | null | undefined): boolean {
  return Boolean(device && (device.toolInstallations?.length ?? 0) > 0);
}

function hasUsageReady(device: Device | null | undefined): boolean {
  return Boolean(device?.lastUsageSyncAt);
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
  /** Only flip after onConnected — keeps loading UI until the parent can take over. */
  const [fullyConnected, setFullyConnected] = useState(false);
  const notifiedRef = useRef<string | null>(null);
  const refreshInFlightRef = useRef<Promise<EnrollmentCredentials | null> | null>(null);

  const markConnected = useCallback(
    (candidate: Device) => {
      setWaitingForTools(false);
      setIsPolling(false);
      setImportProgress(null);
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

    if (candidate && !knownIds.has(candidate.id)) {
      setKnownIds(new Set(devices.map((item) => item.id)));
    }

    if (candidate && !isReadyDevice(candidate)) {
      setWaitingForTools(true);
      setDevice(candidate);
      return;
    }

    if (candidate && isReadyDevice(candidate) && !hasUsageReady(candidate)) {
      // Tools found — keep polling until first usage ingest lands.
      setWaitingForTools(true);
      setDevice(candidate);
      setImportProgress("Waiting for first usage upload…");
      return;
    }

    if (candidate && isReadyDevice(candidate) && hasUsageReady(candidate)) {
      // Usage uploaded — wait for dashboard readiness when available.
      setDevice(candidate);
      try {
        const ctxRes = await fetch("/api/app/workspace-context", { cache: "no-store" });
        if (ctxRes.ok) {
          const ctx = (await ctxRes.json()) as {
            data?: { sync?: { dashboardReady?: boolean; dirtyDayCount?: number } };
          };
          const sync = ctx.data?.sync;
          if (sync && sync.dashboardReady === false) {
            setWaitingForTools(true);
            setImportProgress(
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
  }, [device?.id, knownIds, markConnected, refreshStatus]);

  const generateToken = useCallback(async (): Promise<EnrollmentCredentials | null> => {
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
      body: "{}",
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
  }, []);

  const ensureFreshEnrollment = useCallback(async (): Promise<EnrollmentCredentials | null> => {
    if (token && controlPlaneUrl && !isEnrollmentTokenStale(expiresAt)) {
      return { token, controlPlaneUrl, expiresAt: expiresAt! };
    }

    if (refreshInFlightRef.current) return refreshInFlightRef.current;

    const pending = generateToken().finally(() => {
      refreshInFlightRef.current = null;
    });
    refreshInFlightRef.current = pending;
    return pending;
  }, [controlPlaneUrl, expiresAt, generateToken, token]);

  const resolveCommandForCopy = useCallback(
    async (platform: "macosLinux" | "windows") => {
      const credentials = await ensureFreshEnrollment();
      if (!credentials) {
        throw new Error("Unable to refresh connect command.");
      }
      return buildPlatformInstallCommands(credentials.token, credentials.controlPlaneUrl)[platform];
    },
    [ensureFreshEnrollment],
  );

  useEffect(() => {
    void (async () => {
      const status = await refreshStatus();
      const devices = status?.devices ?? [];
      setKnownIds(new Set(devices.map((item) => item.id)));
      if (!status?.next) await generateToken();
      setLoading(false);
    })();
  }, [generateToken, refreshStatus]);

  useEffect(() => {
    if (pollAfterCopy) return;
    if (isReadyDevice(device) && hasUsageReady(device)) return;

    const interval = window.setInterval(() => void checkEnrollment(), POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [checkEnrollment, device, pollAfterCopy]);

  useEffect(() => {
    if (!pollAfterCopy || pollSession === 0) return;
    if (isReadyDevice(device) && hasUsageReady(device)) return;

    setIsPolling(true);
    setWaitingForTools(false);
    void checkEnrollment();

    const interval = window.setInterval(() => void checkEnrollment(), POLL_INTERVAL_MS);
    const timeout = window.setTimeout(() => {
      setIsPolling(false);
      // Soft-complete on timeout once tools are present — usage may still be uploading.
      if (device && isReadyDevice(device) && notifiedRef.current !== device.id) {
        markConnected(device);
      }
    }, POLL_DURATION_MS);

    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [checkEnrollment, device, markConnected, pollAfterCopy, pollSession]);

  const handleCopied = useCallback(() => {
    if (!pollAfterCopy) return;
    setPollSession((current) => current + 1);
  }, [pollAfterCopy]);

  const checkConnection = useCallback(() => {
    if (!pollAfterCopy || isReadyDevice(device)) return;
    setPollSession((current) => current + 1);
  }, [device, pollAfterCopy]);

  useImperativeHandle(ref, () => ({ checkConnection }), [checkConnection]);

  useEffect(() => {
    onPollingStateChange?.({ isPolling, waitingForTools });
  }, [isPolling, onPollingStateChange, waitingForTools]);

  const commands = useMemo(() => {
    if (!token || !controlPlaneUrl) return null;
    return buildPlatformInstallCommands(token, controlPlaneUrl);
  }, [token, controlPlaneUrl]);

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
  const showWaiting = pollAfterCopy ? isPolling : true;
  const showStatusRow = !hideInlineStatus && (showWaiting || expired);
  // Keep the waiting banner while prep is in flight — Connected panel only after onConnected.
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
      ) : (
        <>
          {commands ? (
            <PlatformCommand
              commands={commands}
              resolveCommandForCopy={resolveCommandForCopy}
              onCopied={handleCopied}
              footerDescription={footerDescription}
            />
          ) : (
            <div className="border border-brand-olive bg-brand-olive p-4 font-mono text-xs text-primary-foreground">Preparing commands…</div>
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
              {expired && (
                <Button variant="outline" size="sm" onClick={() => void generateToken()}>
                  Refresh expired command
                </Button>
              )}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
});
