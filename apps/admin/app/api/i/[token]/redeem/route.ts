import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@usejunction/db";
import { buildInstallCommand, buildPlatformInstallCommands, getPublicAppUrl } from "@/lib/connect-command";
import { getIdentityVerificationStatus, normalizeEmail } from "@/lib/developer-identity";
import { assertCanAddUser } from "@/lib/saas-billing/status";
import { audit } from "@/lib/rbac";
import { hashOpaqueToken } from "@/lib/security";
import { acceptWorkspaceInvite } from "@/lib/workspace-join";
import { issueEnrollmentToken } from "@/lib/enrollment-token";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ error: "authentication required" }, { status: 401 });
  }
  const identity = await getIdentityVerificationStatus(session.user.id);
  if (!identity.verified) {
    return NextResponse.json({ error: identity.error }, { status: identity.status });
  }

  const { token } = await params;
  const link = await prisma.teamInviteLink.findUnique({
    where: { tokenHash: hashOpaqueToken(token) },
    include: {
      organization: { select: { name: true } },
    },
  });

  if (!link || !link.enabled) {
    return NextResponse.json({ error: "invite link not found" }, { status: 404 });
  }
  if (link.expiresAt && link.expiresAt <= new Date()) {
    return NextResponse.json({ error: "invite link expired" }, { status: 410 });
  }

  // Possession of the invite link is enough — admins only share it with people who should join.
  // Do not write teamInviteAllowlist here: that table is only for staged invite emails in the
  // admin UI, and concurrent redeem (e.g. React Strict Mode) races on (link_id, email).
  const sessionEmail = normalizeEmail(session.user.email);
  const userGate = await assertCanAddUser(link.orgId, { userId: session.user.id, email: sessionEmail });
  if (!userGate.allowed) return NextResponse.json({ error: userGate.message }, { status: 403 });

  const pendingInvite = await prisma.organizationInvite.findFirst({
    where: {
      orgId: link.orgId,
      email: sessionEmail,
      acceptedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });

  const existingMembership = pendingInvite
    ? null
    : await prisma.organizationMembership.findUnique({
        where: { userId_orgId: { userId: session.user.id, orgId: link.orgId } },
        select: { role: true },
      });
  const role = pendingInvite?.role ?? existingMembership?.role ?? "user";
  const { developerId } = await prisma.$transaction(async (tx) => {
    const joined = await acceptWorkspaceInvite({
      tx,
      orgId: link.orgId,
      userId: session.user!.id,
      email: sessionEmail,
      name: session.user!.name,
      role,
      source: "team_invite_link.redeemed",
    });
    if (pendingInvite) {
      await tx.organizationInvite.update({
        where: { id: pendingInvite.id },
        data: { acceptedAt: new Date() },
      });
    }
    return joined;
  });

  const developer = await prisma.developer.findUniqueOrThrow({
    where: { id: developerId },
    select: { id: true },
  });

  const issued = await issueEnrollmentToken({
    orgId: link.orgId,
    developerId: developer.id,
    rotate: false,
  });

  await audit({
    orgId: link.orgId,
    actorType: "user",
    actorId: session.user.id,
    action: "team_invite_link.redeemed",
    targetType: "developer",
    targetId: developer.id,
  });

  const base = getPublicAppUrl();
  const installCommand = buildInstallCommand(issued.token, base);
  const installCommands = buildPlatformInstallCommands(issued.token, base);

  return NextResponse.json({
    status: "ready",
    orgId: link.orgId,
    organization: link.organization,
    developerId: developer.id,
    role,
    email: sessionEmail,
    enrollmentToken: issued.token,
    installCommand,
    installCommands,
    expiresAt: issued.expiresAt.toISOString(),
  });
}
