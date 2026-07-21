import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { Prisma, prisma } from "@usejunction/db";
import { buildInstallCommand, buildPlatformInstallCommands, getPublicAppUrl } from "@/lib/connect-command";
import { hasVerifiedIdentity, linkDeveloperToUser, normalizeEmail } from "@/lib/developer-identity";
import { syncTeamSeatQuantityBestEffort } from "@/lib/saas-billing/quantity";
import { assertCanAddUser } from "@/lib/saas-billing/status";
import { audit } from "@/lib/rbac";
import { generateOpaqueToken, hashOpaqueToken } from "@/lib/security";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ error: "authentication required" }, { status: 401 });
  }
  if (!(await hasVerifiedIdentity(session.user.id))) {
    return NextResponse.json({ error: "verified identity required" }, { status: 403 });
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
  const sessionEmail = normalizeEmail(session.user.email);
  const userGate = await assertCanAddUser(link.orgId, { userId: session.user.id, email: sessionEmail });
  if (!userGate.allowed) return NextResponse.json({ error: userGate.message }, { status: 403 });

  try {
    await prisma.teamInviteAllowlist.upsert({
      where: { linkId_email: { linkId: link.id, email: sessionEmail } },
      update: {},
      create: { linkId: link.id, email: sessionEmail },
    });
  } catch (error) {
    // Prisma upsert is not guaranteed to be race-free when two redeem requests
    // arrive before either transaction has committed (React Strict Mode can
    // trigger this in development). The unique index is the source of truth,
    // so a duplicate means the allowlist entry was created concurrently.
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
      throw error;
    }
  }

  const pendingInvite = await prisma.organizationInvite.findFirst({
    where: {
      orgId: link.orgId,
      email: sessionEmail,
      acceptedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });

  const developer = await prisma.$transaction(async (tx) => {
    if (pendingInvite) {
      await tx.organizationMembership.upsert({
        where: { userId_orgId: { userId: session.user!.id, orgId: link.orgId } },
        update: { role: pendingInvite.role },
        create: { userId: session.user!.id, orgId: link.orgId, role: pendingInvite.role },
      });
      const linked = await linkDeveloperToUser({
        tx,
        orgId: link.orgId,
        userId: session.user!.id,
        email: sessionEmail,
        name: session.user!.name,
        role: pendingInvite.role,
      });
      await tx.organizationInvite.update({
        where: { id: pendingInvite.id },
        data: { acceptedAt: new Date() },
      });
      return linked;
    }

    await tx.organizationMembership.upsert({
      where: { userId_orgId: { userId: session.user!.id, orgId: link.orgId } },
      update: {},
      create: { userId: session.user!.id, orgId: link.orgId, role: "user" },
    });
    return linkDeveloperToUser({
      tx,
      orgId: link.orgId,
      userId: session.user!.id,
      email: sessionEmail,
      name: session.user!.name,
      role: "user",
    });
  });

  await syncTeamSeatQuantityBestEffort(link.orgId, "team_invite_link.redeemed");

  const enrollmentToken = generateOpaqueToken("uj_enroll", 32);
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
  await prisma.$transaction(async (tx) => {
    await tx.enrollmentToken.deleteMany({ where: { developerId: developer.id, usedAt: null } });
    await tx.enrollmentToken.create({
      data: {
        orgId: link.orgId,
        teamId: developer.teamId,
        developerId: developer.id,
        tokenHash: hashOpaqueToken(enrollmentToken),
        expiresAt,
      },
    });
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
  const installCommand = buildInstallCommand(enrollmentToken, base);
  const installCommands = buildPlatformInstallCommands(enrollmentToken, base);

  return NextResponse.json({
    status: "ready",
    orgId: link.orgId,
    organization: link.organization,
    developerId: developer.id,
    email: sessionEmail,
    enrollmentToken,
    installCommand,
    installCommands,
    expiresAt: expiresAt.toISOString(),
  });
}
