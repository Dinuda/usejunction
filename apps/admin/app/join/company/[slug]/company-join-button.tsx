"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { signOut } from "next-auth/react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { userFacingError } from "@/lib/errors/user-facing";

export function CompanyJoinButton({ slug }: { slug: string }) {
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void fetch(`/api/organizations/${encodeURIComponent(slug)}/join`, { method: "POST" }).then(async (response) => ({ response, data: await response.json().catch(() => ({})) })).then(({ response, data }) => {
      if (!active) return;
      if (!response.ok) { setError(userFacingError(data.error, "Unable to join this workspace.")); return; }
      window.location.href = "/onboarding";
    });
    return () => { active = false; };
  }, [slug]);
  if (error) return <div className="space-y-4"><Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert><Button variant="outline" onClick={() => signOut({ callbackUrl: `/join/company/${slug}` })}>Use a different account</Button></div>;
  return <div className="flex items-center gap-3 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin text-primary" />Verifying your company account…</div>;
}
