"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PlatformCommand } from "@/components/onboarding/platform-command";
import type { PlatformCommands } from "@/lib/connect-command";

export type RepairDeviceTarget = {
  id: string;
  hostname: string;
};

type RepairCommandResponse = {
  token: string;
  expiresAt: string;
  controlPlaneUrl: string;
  commands: PlatformCommands;
  deviceId: string;
  hostname: string;
};

type Props = {
  device: RepairDeviceTarget | null;
  onOpenChange: (open: boolean) => void;
};

export function RepairConnectionDialog({ device, onOpenChange }: Props) {
  const [repairCommands, setRepairCommands] = useState<PlatformCommands | null>(null);
  const [repairLoading, setRepairLoading] = useState(false);
  const [repairError, setRepairError] = useState<string | null>(null);

  useEffect(() => {
    if (!device) {
      setRepairCommands(null);
      setRepairError(null);
      setRepairLoading(false);
      return;
    }

    let cancelled = false;
    setRepairLoading(true);
    setRepairError(null);
    setRepairCommands(null);

    void (async () => {
      try {
        const response = await fetch(`/api/me/devices/${device.id}/repair`, {
          method: "POST",
          headers: { "content-type": "application/json" },
        });
        const payload = (await response.json().catch(() => null)) as RepairCommandResponse | { error?: string } | null;
        if (cancelled) return;
        if (!response.ok) {
          setRepairError(
            payload && typeof payload === "object" && "error" in payload && payload.error
              ? String(payload.error)
              : "Could not generate a repair command.",
          );
          return;
        }
        if (!payload || !("commands" in payload) || !payload.commands) {
          setRepairError("Could not generate a repair command.");
          return;
        }
        setRepairCommands(payload.commands);
      } catch {
        if (!cancelled) setRepairError("Could not generate a repair command.");
      } finally {
        if (!cancelled) setRepairLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [device]);

  return (
    <Dialog
      open={Boolean(device)}
      onOpenChange={onOpenChange}
    >
      <DialogContent className="max-w-xl gap-5 sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Repair connection.</DialogTitle>
          <DialogDescription>
            Run this command on {device?.hostname ?? "the affected machine"}. It reissues credentials for this device and restarts the agent.
          </DialogDescription>
        </DialogHeader>
        {device ? (
          repairLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Generating repair command…
            </div>
          ) : repairError ? (
            <p className="text-sm text-destructive">{repairError}</p>
          ) : repairCommands ? (
            <PlatformCommand
              commands={repairCommands}
              footerDescription="Your device history stays attached to this machine. The command includes a one-time repair token."
            />
          ) : null
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
