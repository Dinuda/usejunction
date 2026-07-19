"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/panel";
import { Label } from "@/components/ui/label";
import { WorkspaceColorSwatches, WorkspaceIcon } from "@/components/workspace-icon";
import { userFacingError } from "@/lib/errors/user-facing";
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
  const [savedName, setSavedName] = useState(initialName.trim());
  const [savedColor, setSavedColor] = useState<WorkspaceColor>(
    resolveWorkspaceColor(orgId, initialColor),
  );
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const dirty = name.trim() !== savedName || color !== savedColor;

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
        setError(userFacingError(body.error, "Could not update workspace."));
        return;
      }
      setName(body.organization.name);
      const nextColor = resolveWorkspaceColor(orgId, body.organization.color);
      setColor(nextColor);
      setSavedName(body.organization.name.trim());
      setSavedColor(nextColor);
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <Panel as="section" className="sm:p-6" aria-labelledby="workspace-settings-heading">
      <div className="grid gap-6 lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-10">
        <div>
          <h2 id="workspace-settings-heading" className="text-lg font-semibold tracking-tight">
            Workspace
          </h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Name and color for this organization. Visible in the sidebar switcher and team views.
          </p>
        </div>

        <form className="w-full max-w-xl space-y-6" onSubmit={save}>
          {error ? (
            <Alert variant="destructive" className="rounded-none">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="settings-workspace-name">Workspace name</Label>
            <div className="flex items-center gap-3">
              <span className="grid size-11 shrink-0 place-items-center border border-border bg-muted/40">
                <WorkspaceIcon id={orgId} color={color} size="lg" />
              </span>
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
                className="h-11 rounded-none"
              />
            </div>
          </div>

          <fieldset className="space-y-1">
            <legend className="text-sm font-medium">Color</legend>
            <WorkspaceColorSwatches
              value={color}
              disabled={pending}
              onChange={(next) => {
                setColor(next);
                setSaved(false);
              }}
            />
          </fieldset>

          <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-center">
            <Button
              type="submit"
              size="lg"
              className="w-full rounded-none sm:w-auto"
              disabled={pending || !dirty}
              aria-busy={pending}
            >
              {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
              {pending ? "Saving…" : "Save workspace"}
            </Button>
            <p
              role="status"
              aria-live="polite"
              className="min-h-5 text-sm text-muted-foreground"
            >
              {saved && !dirty ? "Saved." : ""}
            </p>
          </div>
        </form>
      </div>
    </Panel>
  );
}
