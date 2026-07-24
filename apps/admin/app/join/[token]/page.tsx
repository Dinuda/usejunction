"use client";

import { useParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { AuthShell } from "@/components/auth/auth-shell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useRawQuery } from "@/lib/api/client";
import { InviteAuthActions } from "./invite-auth-actions";
import { JoinInviteButton } from "./join-invite-button";

type Invite = { organization: { name: string }; email: string; status: string };
type Session = { user?: { id?: string } };

export default function JoinPage() {
  const { token } = useParams<{ token: string }>();
  const invite = useRawQuery<Invite>(["public", "join", token], `/api/join/${encodeURIComponent(token)}/accept`);
  const session = useRawQuery<Session>(["auth", "session"], "/api/auth/session");
  if (invite.isPending || session.isPending) {
    return (
      <AuthShell
        size="md"
        accent="cyan"
        contentAlign="top"
        title="Join workspace."
        description="Loading your invite…"
        statement="Visibility before control."
      >
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin text-primary" />
          Checking your invite…
        </div>
      </AuthShell>
    );
  }
  if (invite.error || !invite.data || invite.data.status !== "valid") {
    return <AuthShell size="md" accent="cyan" contentAlign="top" title="This invitation is unavailable." description="Ask your administrator for a new link." statement="Visibility before control."><Alert variant="destructive"><AlertDescription>This invitation has expired, was already accepted, or is no longer valid.</AlertDescription></Alert></AuthShell>;
  }
  return <AuthShell size="md" accent="cyan" contentAlign="top" title={`Join ${invite.data.organization.name}.`} description={`Continue with ${invite.data.email}, then connect your machine.`} statement="Visibility before control.">{session.data?.user?.id ? <JoinInviteButton token={token} /> : <InviteAuthActions token={token} />}</AuthShell>;
}
