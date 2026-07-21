"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { signOut } from "next-auth/react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { userFacingError } from "@/lib/errors/user-facing";
import { activateWorkspace } from "@/lib/api/client";

export function JoinInviteButton({ token }: { token: string }) {
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    async function accept() {
      const response = await fetch(`/api/join/${encodeURIComponent(token)}/accept`, { method: "POST" });
      const data = await response.json().catch(() => ({}));
      if (!active) return;
      if (!response.ok) { setError(userFacingError(data.error, "Unable to accept this invitation.")); return; }
      try {
        await activateWorkspace(data.orgId);
      } catch {
        if (active) setError("The invitation was accepted, but the workspace could not be activated.");
        return;
      }
      window.location.href = "/onboarding";
    }
    void accept();
    return () => { active = false; };
  }, [token]);
  if (error) return <div className="space-y-4"><Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert><Button variant="outline" onClick={() => signOut({ callbackUrl: `/join/${token}` })}>Use a different account</Button></div>;
  return <div className="flex items-center gap-3 text-sm text-muted-foreground" role="status"><Loader2 className="size-4 animate-spin text-primary" />Joining your workspace…</div>;
}
