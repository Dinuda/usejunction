"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { WorkspaceColorSwatches, WorkspaceIcon } from "@/components/workspace-icon";
import {
  resolveWorkspaceColor,
  type WorkspaceColor,
} from "@/lib/workspace-colors";

export function WorkspaceSettingsCard({
  orgId,
  initialName,
  initialColor,
}: {
  orgId: string;
  initialName: string;
  initialColor: string | null;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [color, setColor] = useState<WorkspaceColor>(resolveWorkspaceColor(orgId, initialColor));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const dirty =
    name.trim() !== initialName.trim() ||
    color !== resolveWorkspaceColor(orgId, initialColor);

  function save() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Enter a workspace name.");
      return;
    }

    setError(null);
    setSaved(false);
    startTransition(async () => {
      const response = await fetch("/api/organizations/current", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed, color }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        organization?: { name: string; color: string | null };
      };
      if (!response.ok || !body.organization) {
        setError(body.error ?? "Could not update workspace.");
        return;
      }
      setName(body.organization.name);
      setColor(resolveWorkspaceColor(orgId, body.organization.color));
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <section className="border bg-card p-5 sm:p-6">
      <div className="mb-6">
        <h2 className="text-lg font-semibold tracking-tight">Workspace</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Name and color for this organization. Visible in the sidebar switcher and team views.
        </p>
      </div>

      {error ? (
        <Alert variant="destructive" className="mb-4 rounded-none">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="settings-workspace-name">Workspace name</Label>
          <div className="flex items-center gap-3">
            <WorkspaceIcon id={orgId} color={color} size="lg" />
            <Input
              id="settings-workspace-name"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setSaved(false);
              }}
              placeholder="Acme"
              maxLength={80}
              disabled={pending}
              className="max-w-md rounded-none"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Color</Label>
          <WorkspaceColorSwatches
            value={color}
            disabled={pending}
            onChange={(next) => {
              setColor(next);
              setSaved(false);
            }}
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <Button
            type="button"
            className="rounded-none gap-2"
            disabled={pending || !dirty}
            onClick={save}
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            {pending ? "Saving…" : "Save workspace"}
          </Button>
          {saved && !dirty ? (
            <p className="text-sm text-muted-foreground">Saved.</p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
