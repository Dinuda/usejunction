import { auth } from "@/auth";
import { prisma } from "@usejunction/db";
import { AuthShell } from "@/components/auth/auth-shell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { hashOpaqueToken } from "@/lib/security";
import { ConnectInviteClient } from "./connect-invite-client";

function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"•".repeat(Math.max(3, local.length - visible.length))}@${domain}`;
}

export default async function ConnectInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const session = await auth();
  const invite = await prisma.connectInvite.findUnique({
    where: { tokenHash: hashOpaqueToken(token) },
    include: { organization: { select: { name: true } } },
  });

  const expired = !invite || invite.expiresAt <= new Date() || invite.status === "expired";
  const used = invite?.status === "used";

  if (expired || !invite) {
    return (
      <AuthShell
        size="md"
        accent="cyan"
        contentAlign="top"
        eyebrow="Connect"
        title="This link is unavailable."
        description="Ask your admin for a new connect command."
        statement="One command. Real data."
      >
        <Alert variant="destructive">
          <AlertDescription>This connect invite has expired or is invalid.</AlertDescription>
        </Alert>
      </AuthShell>
    );
  }

  if (used) {
    return (
      <AuthShell
        size="md"
        accent="cyan"
        contentAlign="top"
        eyebrow="Connect"
        title="Already completed."
        description="This machine connect handshake was already used."
        statement="One command. Real data."
      >
        <p className="text-sm text-muted-foreground">
          If enrollment did not finish, ask your admin to generate a new command.
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      size="md"
      accent="cyan"
      contentAlign="top"
      eyebrow="Connect"
      title={`Join ${invite.organization.name}.`}
      description="Authenticate, then return to Terminal."
      statement="One command. Real data."
    >
      <ConnectInviteClient
        token={token}
        emailMasked={maskEmail(invite.email)}
        signedIn={Boolean(session?.user?.id)}
        sessionEmail={session?.user?.email ?? null}
      />
    </AuthShell>
  );
}
