"use client";

import { useParams } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AppPageSkeleton } from "@/components/app-data-state";
import { useRawQuery } from "@/lib/api/client";
import { InviteAuthActions } from "./invite-auth-actions";
import { JoinInviteButton } from "./join-invite-button";

type Invite = { organization: { name: string }; email: string; status: string };
type Session = { user?: { id?: string } };

export default function JoinPage() {
  const { token } = useParams<{ token: string }>();
  const invite = useRawQuery<Invite>(["public", "join", token], `/api/join/${encodeURIComponent(token)}/accept`);
  const session = useRawQuery<Session>(["auth", "session"], "/api/auth/session");
  if (invite.isPending || session.isPending) return <main className="mx-auto max-w-xl p-6"><AppPageSkeleton /></main>;
  if (invite.error || !invite.data || invite.data.status !== "valid") {
    return <AuthShell size="md" accent="cyan" contentAlign="top" eyebrow="Join" title="This invitation is unavailable." description="Ask your administrator for a new link." statement="Visibility before control."><Alert variant="destructive"><AlertDescription>This invitation has expired, was already accepted, or is no longer valid.</AlertDescription></Alert></AuthShell>;
  }
  return <AuthShell size="md" accent="cyan" contentAlign="top" eyebrow="Join" title={`Join ${invite.data.organization.name}.`} description={`Continue with ${invite.data.email}, then connect your machine.`} statement="Visibility before control.">{session.data?.user?.id ? <JoinInviteButton token={token} /> : <InviteAuthActions token={token} />}</AuthShell>;
}
