"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { hasToolBrandIcon, ToolLogoTile } from "@/components/tools/tool-brand-icon";
import { Panel } from "@/components/panel";
import { PlatformCommand } from "@/components/onboarding/platform-command";
import { buildPlatformInstallCommands } from "@/lib/connect-command";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { canonicalToolKey } from "@/lib/tools/catalog";
import { userFacingError } from "@/lib/errors/user-facing";

type Device = {
  id: string;
  hostname: string;
  os: string;
  lastSeenAt: string;
  toolInstallations?: Array<{ toolName: string; version?: string | null }>;
};

type Props = {
  title?: string;
  description?: string;
  compact?: boolean;
  onConnected?: (device: Device) => void;
};

/** Device is ready once enrolled and the agent has reported at least one tool. */
function isReadyDevice(device: Device | null | undefined): boolean {
  return Boolean(device && (device.toolInstallations?.length ?? 0) > 0);
}

export function DeviceConnectCard({
  title = "Connect command",
  description = "Choose this device's platform, then run the command. It installs the agent, enables reporting, and starts it in the background. Expires in 15 minutes.",
  compact = false,
  onConnected,
}: Props) {
  const [device, setDevice] = useState<Device | null>(null);
  const [knownIds, setKnownIds] = useState<Set<string>>(new Set());
  const [token, setToken] = useState<string | null>(null);
  const [controlPlaneUrl, setControlPlaneUrl] = useState("");
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [waitingForTools, setWaitingForTools] = useState(false);
  const notifiedRef = useRef<string | null>(null);

  const refreshStatus = useCallback(async () => {
    const response = await fetch("/api/onboarding", { cache: "no-store" });
    if (!response.ok) return null;
    const data = await response.json();
    const devices = (data.developer?.devices as Device[] | undefined) ?? [];
    const next = devices[0] ?? null;
    setDevice(next);
    return { next, devices };
  }, []);

  const generateToken = useCallback(async () => {
    setError(null);
    // Ensure a workspace exists and the JWT carries orgId before enroll.
    // OAuth users can reach Connect with a null session orgId even after
    // ensureOwnerWorkspace has run.
    const bootstrap = await fetch("/api/onboarding", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json", "x-requested-with": "usejunction-web" },
      body: "{}",
    });
    if (bootstrap.status === 401) {
      window.location.href = "/login?from=/onboarding";
      return;
    }
    if (bootstrap.ok) {
      const created = await bootstrap.json().catch(() => null) as { orgId?: string } | null;
      if (created?.orgId) {
        await fetch("/api/me/workspace", {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "content-type": "application/json",
            "x-requested-with": "usejunction-web",
          },
          body: JSON.stringify({ orgId: created.orgId }),
        });
      }
    }

    const response = await fetch("/api/me/enrollment-token", { method: "POST" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(userFacingError(data.error, "Unable to create a connect command."));
      return;
    }
    setToken(data.token);
    setExpiresAt(data.expiresAt);
    setControlPlaneUrl(data.controlPlaneUrl || window.location.origin);
  }, []);

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
    if (isReadyDevice(device)) return;
    const interval = window.setInterval(async () => {
      const status = await refreshStatus();
      const devices = status?.devices ?? [];
      const fresh = devices.find((item) => !knownIds.has(item.id)) ?? null;
      const candidate = fresh ?? devices.find((item) => item.id === device?.id) ?? status?.next ?? null;

      if (candidate && !knownIds.has(candidate.id)) {
        setKnownIds(new Set(devices.map((item) => item.id)));
      }

      // Enroll creates the device before the agent finishes detecting tools —
      // keep waiting until tools are reported.
      if (candidate && !isReadyDevice(candidate)) {
        setWaitingForTools(true);
        setDevice(candidate);
        return;
      }

      if (candidate && isReadyDevice(candidate)) {
        setWaitingForTools(false);
        setDevice(candidate);
        if (notifiedRef.current !== candidate.id) {
          notifiedRef.current = candidate.id;
          onConnected?.(candidate);
        }
      }
    }, 2500);
    return () => window.clearInterval(interval);
  }, [device, knownIds, onConnected, refreshStatus]);

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

  if (device && isReadyDevice(device)) {
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

  const expired = Boolean(expiresAt && new Date(expiresAt).getTime() <= Date.now());

  return (
    <div className="space-y-4">
      {!compact && (
        <div>
          <p className="text-sm font-medium">{title}</p>
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        </div>
      )}
      {commands ? (
        <PlatformCommand commands={commands} />
      ) : (
        <div className="border border-brand-olive bg-brand-olive p-4 font-mono text-xs text-primary-foreground">Preparing commands…</div>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin text-primary" />
          {waitingForTools
            ? "Device enrolled — waiting for tool detection…"
            : "Waiting for enroll…"}
        </div>
        {expired && (
          <Button variant="outline" size="sm" onClick={() => void generateToken()}>
            Refresh expired command
          </Button>
        )}
      </div>
    </div>
  );
}
