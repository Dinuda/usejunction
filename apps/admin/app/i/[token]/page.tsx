"use client";

import { useParams } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AppPageSkeleton } from "@/components/app-data-state";
import { useRawQuery } from "@/lib/api/client";
import { TeamInviteClient } from "./team-invite-client";

type Invite = { status: string; organization: { name: string } };
type Session = { user?: { id?: string; email?: string | null } };

export default function TeamInvitePage() {
  const { token } = useParams<{ token: string }>();
  const invite = useRawQuery<Invite>(["public", "team-invite", token], `/api/i/${encodeURIComponent(token)}`);
  const session = useRawQuery<Session>(["auth", "session"], "/api/auth/session");
  if (invite.isPending || session.isPending) return <main className="mx-auto max-w-xl p-6"><AppPageSkeleton /></main>;
  if (invite.error || !invite.data || invite.data.status !== "active") {
    return <AuthShell size="md" accent="cyan" contentAlign="top" eyebrow="Join" title="This invite is unavailable." description="Ask your admin for a new link." statement="Visibility before control."><Alert variant="destructive"><AlertDescription>This invite has expired, been rotated, or is invalid.</AlertDescription></Alert></AuthShell>;
  }
  return <TeamInviteClient token={token} organizationName={invite.data.organization.name} signedIn={Boolean(session.data?.user?.id)} sessionEmail={session.data?.user?.email ?? null} />;
}
