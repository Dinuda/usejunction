"use client";

import { useParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { AuthShell } from "@/components/auth/auth-shell";
import { useRawQuery } from "@/lib/api/client";
import { TeamInviteClient } from "./team-invite-client";

type Invite = { status: string; organization: { name: string } };
type Session = { user?: { id?: string; email?: string | null } };

export default function TeamInvitePage() {
  const { token } = useParams<{ token: string }>();
  const invite = useRawQuery<Invite>(["public", "team-invite", token], `/api/i/${encodeURIComponent(token)}`);
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
  if (invite.error || !invite.data || invite.data.status !== "active") {
    return (
      <AuthShell
        size="md"
        accent="cyan"
        contentAlign="top"
        title="This invite is unavailable."
        description="Ask your admin for a new link."
        statement="Visibility before control."
      >
        <p className="text-sm text-muted-foreground">This invite has expired, been rotated, or is invalid.</p>
      </AuthShell>
    );
  }
  return <TeamInviteClient token={token} organizationName={invite.data.organization.name} signedIn={Boolean(session.data?.user?.id)} sessionEmail={session.data?.user?.email ?? null} />;
}
