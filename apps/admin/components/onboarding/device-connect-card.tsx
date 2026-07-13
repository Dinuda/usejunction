"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Clipboard, Loader2 } from "lucide-react";
import { buildSimulateConnectCommand } from "@/lib/connect-command";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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

export function DeviceConnectCard({
  title = "Connect command",
  description = "Run this in Terminal. Expires in 15 minutes.",
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
      setError(data.error ?? "Unable to create a connect command.");
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
      if (forceEnroll || !status?.next) await generateToken();
      setLoading(false);
    })();
  }, [forceEnroll, generateToken, refreshStatus]);

  useEffect(() => {
    if (device && !addingAnother && !forceEnroll) return;
    const interval = window.setInterval(async () => {
      const status = await refreshStatus();
      const devices = status?.devices ?? [];
      const fresh = devices.find((item) => !knownIds.has(item.id));
      if (fresh) {
        setKnownIds(new Set(devices.map((item) => item.id)));
        setAddingAnother(false);
        onConnected?.(fresh);
      }
    }, 2500);
    return () => window.clearInterval(interval);
  }, [addingAnother, device, forceEnroll, knownIds, onConnected, refreshStatus]);

  const command = useMemo(() => {
    if (!token || !controlPlaneUrl) return "";
    return buildSimulateConnectCommand(token, controlPlaneUrl);
  }, [token, controlPlaneUrl]);

  async function copy() {
    if (!command) return;
    await navigator.clipboard.writeText(command);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  if (loading) {
    return (
      <div className="flex items-center gap-3 border bg-card px-4 py-5 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin text-primary" />
        Checking device…
      </div>
    );
  }

  if (device && !addingAnother && !forceEnroll) {
    const tools = device.toolInstallations ?? [];
    return (
      <div className="border border-emerald-200 bg-emerald-50/40 p-5">
        <p className="font-mono text-[0.65rem] uppercase tracking-[0.14em] text-emerald-800">Connected</p>
        <p className="mt-3 text-sm font-medium">{device.hostname}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {device.os} · last seen {new Date(device.lastSeenAt).toLocaleString()}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {tools.length ? (
            tools.map((tool) => (
              <span key={tool.toolName} className="border bg-background px-2 py-1 font-mono text-[0.65rem]">
                {tool.toolName}
                {tool.version ? ` ${tool.version}` : ""}
              </span>
            ))
          ) : (
            <span className="text-xs text-muted-foreground">Enrolled. Tool scan can run later.</span>
          )}
        </div>
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

  return (
    <div className="border bg-card">
      {!compact && (
        <div className="border-b px-4 py-3">
          <p className="text-sm font-medium">{title}</p>
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        </div>
      )}
      <div className="space-y-4 p-4">
        <div className="relative overflow-hidden border border-zinc-800 bg-zinc-950 p-4 pr-14 font-mono text-xs leading-6 text-zinc-100">
          <code className="break-all">{command || "Preparing command…"}</code>
          <button
            type="button"
            className={cn(
              "absolute right-3 top-3 rounded-md border border-zinc-700 p-2 text-zinc-300 transition hover:bg-zinc-800",
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
        <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin text-primary" />
            Waiting for enroll…
          </div>
          <div className="flex gap-2">
            {expiresAt && new Date(expiresAt).getTime() <= Date.now() && (
              <Button variant="outline" size="sm" onClick={() => void generateToken()}>
                Refresh
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => void generateToken()}>
              New command
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
