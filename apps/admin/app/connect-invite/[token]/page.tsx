"use client";

import { useParams } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AppPageSkeleton } from "@/components/app-data-state";
import { useRawQuery } from "@/lib/api/client";
import { ConnectInviteClient } from "./connect-invite-client";

type Invite = { status: string; emailMasked: string; organization: { name: string } };
type Session = { user?: { id?: string; email?: string | null } };

export default function ConnectInvitePage() {
  const { token } = useParams<{ token: string }>();
  const invite = useRawQuery<Invite>(["public", "connect-invite", token], `/api/connect-invite/${encodeURIComponent(token)}`);
  const session = useRawQuery<Session>(["auth", "session"], "/api/auth/session");
  if (invite.isPending || session.isPending) return <main className="mx-auto max-w-xl p-6"><AppPageSkeleton /></main>;
  if (invite.error || !invite.data || invite.data.status === "expired") {
    return <AuthShell size="md" accent="cyan" contentAlign="top" eyebrow="Connect" title="This link is unavailable." description="Ask your admin for a new connect command." statement="One command. Real data."><Alert variant="destructive"><AlertDescription>This connect invite has expired or is invalid.</AlertDescription></Alert></AuthShell>;
  }
  if (invite.data.status === "used") {
    return <AuthShell size="md" accent="cyan" contentAlign="top" eyebrow="Connect" title="Already completed." description="This machine connect handshake was already used." statement="One command. Real data."><p className="text-sm text-muted-foreground">If enrollment did not finish, ask your admin to generate a new command.</p></AuthShell>;
  }
  return <AuthShell size="md" accent="cyan" contentAlign="top" eyebrow="Connect" title={`Join ${invite.data.organization.name}.`} description="Authenticate, then return to Terminal." statement="One command. Real data."><ConnectInviteClient token={token} email={invite.data.emailMasked} signedIn={Boolean(session.data?.user?.id)} sessionEmail={session.data?.user?.email ?? null} /></AuthShell>;
}
