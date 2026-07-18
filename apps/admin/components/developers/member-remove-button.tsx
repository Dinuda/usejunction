"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { userFacingError } from "@/lib/errors/user-facing";

export function MemberRemoveButton({
  developerId,
  memberName,
  locked = false,
}: {
  developerId: string;
  memberName: string;
  locked?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (locked) return null;

  async function removeMember() {
    setSaving(true);
    setError(null);
    const response = await fetch(`/api/developers/${developerId}`, { method: "DELETE" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(userFacingError(body.error, "Could not remove member."));
      setSaving(false);
      return;
    }
    setOpen(false);
    router.push("/team");
    router.refresh();
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="rounded-none text-destructive hover:bg-destructive/10 hover:text-destructive"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        Remove from team
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (saving) return;
          setOpen(next);
          if (!next) setError(null);
        }}
      >
        <DialogContent className="max-w-md gap-5">
          <DialogHeader>
            <DialogTitle>Remove {memberName}?</DialogTitle>
            <DialogDescription>
              They lose workspace access, their machines are removed from coverage,
              and the agent uninstalls on the next heartbeat. Usage history and
              extracted work stay on this workspace.
            </DialogDescription>
          </DialogHeader>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void removeMember()} disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
