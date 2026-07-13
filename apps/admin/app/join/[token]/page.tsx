import { auth } from "@/auth";
import { prisma } from "@usejunction/db";
import { AuthFrame } from "@/components/auth/auth-shell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  const invite = await prisma.organizationInvite.findUnique({ where: { tokenHash: hashOpaqueToken(token) }, include: { organization: { select: { name: true } } } });
  const invalid = !invite || invite.acceptedAt || invite.expiresAt <= new Date();
  return <AuthFrame title={invalid ? "This invitation is unavailable" : `Join ${invite.organization.name}`} description={invalid ? "This link can no longer be used." : "Join your team workspace, then connect your computer in the next step."}>
    <Card className="shadow-none"><CardHeader className="border-b p-5"><CardTitle className="text-base font-medium">{invalid ? "Ask for a new invitation" : "Confirm your account"}</CardTitle></CardHeader><CardContent className="space-y-5 p-5">
      {invalid ? <Alert variant="destructive"><AlertDescription>The invitation has expired, was already accepted, or is no longer valid. Ask your administrator for a new link.</AlertDescription></Alert> : <><p className="text-sm leading-6 text-muted-foreground">Continue with the account for <span className="font-medium text-foreground">{maskEmail(invite.email)}</span>.</p>{session?.user?.id ? <JoinInviteButton token={token} /> : <InviteAuthActions token={token} />}</>}
    </CardContent></Card>
  </AuthFrame>;
}
