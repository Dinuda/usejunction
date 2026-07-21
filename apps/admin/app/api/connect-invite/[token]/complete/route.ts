import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@usejunction/db";
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
  const connectInvite = await prisma.connectInvite.findUnique({
    where: { tokenHash: hashOpaqueToken(token) },
  });
  if (!connectInvite) return NextResponse.json({ error: "connect invite not found" }, { status: 404 });
  if (connectInvite.expiresAt <= new Date()) {
    await prisma.connectInvite.update({ where: { id: connectInvite.id }, data: { status: "expired" } });
    return NextResponse.json({ error: "connect invite expired" }, { status: 410 });
  }
  if (connectInvite.status === "used") {
    return NextResponse.json({ error: "connect invite already used" }, { status: 410 });
  }
  if (connectInvite.status === "ready" && connectInvite.enrollmentTokenReveal) {
    return NextResponse.json({
      status: "ready",
      orgId: connectInvite.orgId,
    });
  }

  const sessionEmail = normalizeEmail(session.user.email);
  if (sessionEmail !== connectInvite.email) {
    return NextResponse.json(
      { error: `Sign in as ${connectInvite.email} to continue. You are signed in as ${sessionEmail}.` },
      { status: 403 },
    );
  }
  const userGate = await assertCanAddUser(connectInvite.orgId, { userId: session.user.id, email: sessionEmail });
  if (!userGate.allowed) return NextResponse.json({ error: userGate.message }, { status: 403 });

  const developer = await prisma.$transaction(async (tx) => {
    if (connectInvite.inviteId) {
      const invite = await tx.organizationInvite.findUnique({ where: { id: connectInvite.inviteId } });
      if (invite && !invite.acceptedAt && invite.expiresAt > new Date()) {
        await tx.organizationMembership.upsert({
          where: { userId_orgId: { userId: session.user!.id, orgId: invite.orgId } },
          update: { role: invite.role },
          create: { userId: session.user!.id, orgId: invite.orgId, role: invite.role },
        });
        const linked = await linkDeveloperToUser({
          tx,
          orgId: invite.orgId,
          userId: session.user!.id,
          email: invite.email,
          name: session.user!.name,
          role: invite.role,
        });
        await tx.organizationInvite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } });
        return linked;
      }
    }

    await tx.organizationMembership.upsert({
      where: { userId_orgId: { userId: session.user!.id, orgId: connectInvite.orgId } },
      update: {},
      create: { userId: session.user!.id, orgId: connectInvite.orgId, role: "user" },
    });
    return linkDeveloperToUser({
      tx,
      orgId: connectInvite.orgId,
      userId: session.user!.id,
      email: connectInvite.email,
      name: session.user!.name,
      role: "user",
    });
  });

  await syncTeamSeatQuantityBestEffort(connectInvite.orgId, "connect_invite.ready");

  const enrollmentToken = generateOpaqueToken("uj_enroll", 32);
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
  await prisma.$transaction(async (tx) => {
    await tx.enrollmentToken.deleteMany({ where: { developerId: developer.id, usedAt: null } });
    await tx.enrollmentToken.create({
      data: {
        orgId: connectInvite.orgId,
        teamId: developer.teamId,
        developerId: developer.id,
        tokenHash: hashOpaqueToken(enrollmentToken),
        expiresAt,
      },
    });
    await tx.connectInvite.update({
      where: { id: connectInvite.id },
      data: {
        status: "ready",
        enrollmentTokenHash: hashOpaqueToken(enrollmentToken),
        enrollmentTokenReveal: enrollmentToken,
      },
    });
  });

  await audit({
    orgId: connectInvite.orgId,
    actorType: "user",
    actorId: session.user.id,
    action: "connect_invite.ready",
    targetType: "developer",
    targetId: developer.id,
  });

  return NextResponse.json({
    status: "ready",
    orgId: connectInvite.orgId,
    developerId: developer.id,
  });
}
