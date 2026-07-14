import { auth } from "@/auth";
import { prisma } from "@usejunction/db";
import { AuthShell } from "@/components/auth/auth-shell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { hashOpaqueToken } from "@/lib/security";
import { TeamInviteClient } from "./team-invite-client";

export default async function TeamInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const session = await auth();
  const link = await prisma.teamInviteLink.findUnique({
    where: { tokenHash: hashOpaqueToken(token) },
    include: {
      organization: { select: { name: true } },
      allowlist: { select: { email: true } },
    },
  });

  if (!link || !link.enabled || (link.expiresAt && link.expiresAt <= new Date())) {
    return (
      <AuthShell
        size="md"
        accent="cyan"
        contentAlign="top"
        eyebrow="Join"
        title="This invite is unavailable."
        description="Ask your admin for a new link."
        statement="Visibility before control."
      >
        <Alert variant="destructive">
          <AlertDescription>This invite has expired, been rotated, or is invalid.</AlertDescription>
        </Alert>
      </AuthShell>
    );
  }

  return (
    <TeamInviteClient
      token={token}
      organizationName={link.organization.name}
      signedIn={Boolean(session?.user?.id)}
      sessionEmail={session?.user?.email ?? null}
    />
  );
}
