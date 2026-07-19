"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Cable, X } from "lucide-react";
import { DeviceConnectCard } from "@/components/onboarding/device-connect-card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const HIDE_KEY = "uj:hide-connect-banner";

type Props = {
  /** When false, banner is not rendered. */
  show: boolean;
};

export function ConnectMachineBanner({ show }: Props) {
  const router = useRouter();
  const [hidden, setHidden] = useState(true);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!show) {
      setHidden(true);
      return;
    }
    try {
      setHidden(window.sessionStorage.getItem(HIDE_KEY) === "1");
    } catch {
      setHidden(false);
    }
  }, [show]);

  if (!show || hidden) return null;

  function dismiss() {
    try {
      window.sessionStorage.setItem(HIDE_KEY, "1");
    } catch {
      /* ignore */
    }
    setHidden(true);
  }

  return (
    <>
      <div className="mb-6 flex flex-col gap-3 border border-primary/30 bg-primary/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <Cable className="mt-0.5 size-4 shrink-0 text-primary" />
          <div className="min-w-0">
            <p className="text-sm font-medium">Connect this machine to start reporting.</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              One install command enrolls the agent, configures tools, and starts background metrics.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button type="button" size="sm" onClick={() => setOpen(true)}>
            Connect this machine
          </Button>
          <Button type="button" size="icon-sm" variant="ghost" aria-label="Dismiss" onClick={dismiss}>
            <X className="size-4" />
          </Button>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl gap-5 sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Connect this machine.</DialogTitle>
            <DialogDescription>
              Run the install command in Terminal. Expires in 15 minutes.
            </DialogDescription>
          </DialogHeader>
          <DeviceConnectCard
            compact
            title="Connect command"
            description="Installs the agent, configures tools, and starts reporting."
            onConnected={() => {
              router.refresh();
              setOpen(false);
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
