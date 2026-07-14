"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const CREATE_WORKSPACE_VALUE = "__create_workspace__";

export type WorkspaceOption = {
  id: string;
  name: string;
  role: string;
};

export function WorkspaceSwitcher({
  organizations,
  currentOrgId,
}: {
  organizations: WorkspaceOption[];
  currentOrgId: string | null;
}) {
  const router = useRouter();
  const value = currentOrgId ?? organizations[0]?.id;
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function switchWorkspace(orgId: string) {
    if (orgId === value) return;
    const response = await fetch("/api/me/workspace", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ orgId }),
    });
    if (!response.ok) return;
    router.refresh();
  }

  async function createWorkspace(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Enter a workspace name.");
      return;
    }

    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/organizations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(payload.error ?? "Could not create workspace.");
        return;
      }
      setCreateOpen(false);
      setName("");
      router.push("/onboarding?resume=1");
      router.refresh();
    } catch {
      setError("Could not create workspace.");
    } finally {
      setPending(false);
    }
  }

  if (!organizations.length || !value) {
    return <span className="text-sm font-medium text-foreground">UseJunction</span>;
  }

  return (
    <>
      <Select
        value={value}
        onValueChange={(next) => {
          if (next === CREATE_WORKSPACE_VALUE) {
            setCreateOpen(true);
            return;
          }
          void switchWorkspace(next);
        }}
      >
        <SelectTrigger
          size="sm"
          className="h-9 min-w-[12rem] max-w-[18rem] border-border bg-background text-sm font-medium text-foreground shadow-none"
          aria-label="Workspace"
        >
          <SelectValue placeholder="Select workspace" />
        </SelectTrigger>
        <SelectContent>
          {organizations.map((org) => (
            <SelectItem key={org.id} value={org.id}>
              {org.name}
            </SelectItem>
          ))}
          <SelectSeparator />
          <SelectItem value={CREATE_WORKSPACE_VALUE}>
            <Plus className="size-4" />
            Create workspace
          </SelectItem>
        </SelectContent>
      </Select>

      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) {
            setName("");
            setError(null);
          }
        }}
      >
        <DialogContent className="max-w-md gap-5">
          <DialogHeader>
            <DialogTitle>Create a workspace.</DialogTitle>
            <DialogDescription>
              Start a separate organization for another team, product, or client.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={createWorkspace}>
            <div className="space-y-2">
              <Label htmlFor="workspace-name">Workspace name</Label>
              <Input
                id="workspace-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Acme"
                autoFocus
                maxLength={80}
                disabled={pending}
              />
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)} disabled={pending}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Creating…" : "Create workspace"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
