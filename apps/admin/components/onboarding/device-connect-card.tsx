"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Clipboard, Loader2 } from "lucide-react";
import { hasToolBrandIcon, ToolLogoTile } from "@/components/tools/tool-brand-icon";
import { buildInstallCommand } from "@/lib/connect-command";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { canonicalToolKey } from "@/lib/tools/catalog";
import { cn } from "@/lib/utils";
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
  /** Always show the enroll command (skip the connected summary). */
  forceEnroll?: boolean;
  onConnected?: (device: Device) => void;
};

/** Device is ready once enrolled and the agent has reported at least one tool. */
function isReadyDevice(device: Device | null | undefined): device is Device {
  return Boolean(device && (device.toolInstallations?.length ?? 0) > 0);
}

export function DeviceConnectCard({
  title = "Connect command",
  description = "Run this in Terminal. Installs the agent, configures tools, enables reporting, and starts the daemon. Expires in 15 minutes.",
  compact = false,
  forceEnroll = false,
  onConnected,
}: Props) {
  const [device, setDevice] = useState<Device | null>(null);
  const [knownIds, setKnownIds] = useState<Set<string>>(new Set());
  const [addingAnother, setAddingAnother] = useState(forceEnroll);
  const [token, setToken] = useState<string | null>(null);
  const [controlPlaneUrl, setControlPlaneUrl] = useState("");
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
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
      // Only skip the enroll UI when a known device has already reported tools.
      if (forceEnroll || !isReadyDevice(status?.next)) await generateToken();
      setLoading(false);
    })();
  }, [forceEnroll, generateToken, refreshStatus]);

  useEffect(() => {
    if (isReadyDevice(device) && !addingAnother && !forceEnroll) return;
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

      if (isReadyDevice(candidate)) {
        setWaitingForTools(false);
        setAddingAnother(false);
        setDevice(candidate);
        if (notifiedRef.current !== candidate.id) {
          notifiedRef.current = candidate.id;
          onConnected?.(candidate);
        }
      }
    }, 2500);
    return () => window.clearInterval(interval);
  }, [addingAnother, device, forceEnroll, knownIds, onConnected, refreshStatus]);

  const command = useMemo(() => {
    if (!token || !controlPlaneUrl) return "";
    return buildInstallCommand(token, controlPlaneUrl);
  }, [token, controlPlaneUrl]);

  async function copy() {
    if (!command) return;
    await navigator.clipboard.writeText(command);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  if (loading) {
    return (
      <div className="flex items-center gap-3 border border-border bg-card px-4 py-5 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin text-primary" />
        Checking device…
      </div>
    );
  }

  if (isReadyDevice(device) && !addingAnother && !forceEnroll) {
    const connectedTools = [
      ...new Set((device.toolInstallations ?? []).map((tool) => canonicalToolKey(tool.toolName)).filter(hasToolBrandIcon)),
    ];
    return (
      <div className="border border-border bg-card p-4">
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
        {!compact && (
          <Button
            className="mt-4"
            variant="outline"
            size="sm"
            onClick={() => {
              setAddingAnother(true);
              void generateToken();
            }}
          >
            Connect another
          </Button>
        )}
      </div>
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
      <div className="relative overflow-hidden border border-brand-olive bg-brand-olive p-4 pr-14 font-mono text-xs leading-6 text-primary-foreground">
        <code className="break-all">{command || "Preparing command…"}</code>
        <button
          type="button"
          className={cn(
            "absolute right-3 top-3 border border-brand-olive-border p-2 text-primary-foreground/80 transition hover:bg-brand-olive-secondary",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
          onClick={copy}
          disabled={!command}
          aria-label="Copy connect command"
        >
          {copied ? <Check className="size-4" /> : <Clipboard className="size-4" />}
        </button>
      </div>
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
