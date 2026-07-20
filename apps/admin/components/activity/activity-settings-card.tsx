"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { OrgActivitySettings } from "@/lib/activity/contracts";
import { Panel } from "@/components/panel";
import { cn } from "@/lib/utils";
import { userFacingError } from "@/lib/errors/user-facing";

type ToggleRowProps = {
  title: string;
  description: string;
  enabled: boolean;
  pending: boolean;
  onToggle: (next: boolean) => void;
};

function ToggleRow({ title, description, enabled, pending, onToggle }: ToggleRowProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-base font-semibold tracking-tight">{title}</h2>
          <Badge
            variant="outline"
            className={cn(
              "rounded-none text-[0.65rem] uppercase tracking-[0.08em]",
              enabled
                ? "border-success/30 bg-success/10 text-success"
                : "border-border bg-muted text-muted-foreground",
            )}
          >
            {enabled ? "Allowed" : "Admin only"}
          </Badge>
        </div>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
      <div className="shrink-0">
        <Button
          type="button"
          variant={enabled ? "outline" : "default"}
          className="rounded-none"
          disabled={pending}
          onClick={() => onToggle(!enabled)}
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          {enabled ? "Restrict to admins" : "Allow for team"}
        </Button>
      </div>
    </div>
  );
}

export function ActivitySettingsCard({ initialSettings }: { initialSettings: OrgActivitySettings }) {
  const [settings, setSettings] = useState(initialSettings);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save(patch: Partial<Pick<OrgActivitySettings, "teamPeriodControlsEnabled" | "teamDeviceActivityEnabled">>) {
    setError(null);
    startTransition(async () => {
      const response = await fetch("/api/activity/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        settings?: OrgActivitySettings;
      };
      if (!response.ok || !body.settings) {
        setError(userFacingError(body.error, "Could not update Activity settings"));
        return;
      }
      setSettings(body.settings);
    });
  }

  return (
    <Panel as="section" className="sm:p-6">
      <div className="mb-2">
        <h2 className="text-lg font-semibold tracking-tight">Activity visibility</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose what developers see on My activity. Admins always get period filters, device
          activity exchanges, and usage breakdowns.
        </p>
      </div>

      {error ? (
        <Alert variant="destructive" className="mb-4 rounded-none">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="mt-6 space-y-8">
        <ToggleRow
          title="Period and cycle filters"
          description="Lets teammates switch current/previous billing cycles and rolling ranges on My activity."
          enabled={settings.teamPeriodControlsEnabled}
          pending={pending}
          onToggle={(teamPeriodControlsEnabled) => save({ teamPeriodControlsEnabled })}
        />
        <ToggleRow
          title="Device activity feed"
          description="Lets teammates see machine exchanges, returned data, and observed activity for their device."
          enabled={settings.teamDeviceActivityEnabled}
          pending={pending}
          onToggle={(teamDeviceActivityEnabled) => save({ teamDeviceActivityEnabled })}
        />
      </div>
    </Panel>
  );
}
