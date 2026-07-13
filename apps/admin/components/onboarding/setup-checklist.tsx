"use client";

import { useEffect, useState } from "react";
import { Circle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type Status = {
  setupChecklistDismissedAt?: string | null;
  steps?: { team?: boolean };
};

export function SetupChecklist() {
  const [status, setStatus] = useState<Status | null>(null);

  useEffect(() => {
    void fetch("/api/onboarding", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then(setStatus);
  }, []);

  if (!status || status.setupChecklistDismissedAt || status.steps?.team) return null;

  async function dismiss() {
    await fetch("/api/onboarding", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "dismiss_checklist" }),
    });
    setStatus((current) => (current ? { ...current, setupChecklistDismissedAt: new Date().toISOString() } : current));
  }

  return (
    <Card className="mb-8 gap-0 border-primary/25 py-0 shadow-none">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-medium">Invite your team</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Send secure links so developers can connect their computers.
            </p>
          </div>
          <button
            type="button"
            onClick={dismiss}
            className="p-1 text-muted-foreground hover:text-foreground"
            aria-label="Dismiss invite reminder"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
          <Circle className="size-3.5" />
          No invitations sent yet
        </div>
        <div className="mt-4">
          <Button size="sm" variant="outline" onClick={() => document.getElementById("invite-team")?.scrollIntoView({ behavior: "smooth" })}>
            Invite developers
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
