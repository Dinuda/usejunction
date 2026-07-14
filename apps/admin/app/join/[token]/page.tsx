import { auth } from "@/auth";
import { prisma } from "@usejunction/db";
import { AuthShell } from "@/components/auth/auth-shell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { hashOpaqueToken } from "@/lib/security";
import { InviteAuthActions } from "./invite-auth-actions";
import { JoinInviteButton } from "./join-invite-button";

function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  return `${local.slice(0, Math.min(2, local.length))}${"•".repeat(Math.max(3, local.length - 2))}@${domain}`;
}

export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const session = await auth();
  const invite = await prisma.organizationInvite.findUnique({
    where: { tokenHash: hashOpaqueToken(token) },
    include: { organization: { select: { name: true } } },
  });
  const invalid = !invite || invite.acceptedAt || invite.expiresAt <= new Date();

  if (invalid) {
    return (
      <AuthShell
        size="md"
        accent="cyan"
        contentAlign="top"
        eyebrow="Join"
        title="This invitation is unavailable."
        description="Ask your administrator for a new link."
        statement="Visibility before control."
      >
        <Alert variant="destructive">
          <AlertDescription>This invitation has expired, was already accepted, or is no longer valid.</AlertDescription>
        </Alert>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      size="md"
      accent="cyan"
      contentAlign="top"
      eyebrow="Join"
      title={`Join ${invite.organization.name}.`}
      description={`Continue with ${maskEmail(invite.email)}, then connect your machine.`}
      statement="Visibility before control."
    >
      {session?.user?.id ? <JoinInviteButton token={token} /> : <InviteAuthActions token={token} />}
    </AuthShell>
  );
}
