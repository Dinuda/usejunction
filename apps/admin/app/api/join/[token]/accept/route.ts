import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@usejunction/db";
import { hasVerifiedIdentity, linkDeveloperToUser, normalizeEmail } from "@/lib/developer-identity";
import { ACTIVE_ORG_COOKIE, activeOrgCookieOptions } from "@/lib/require-organization";
import { audit } from "@/lib/rbac";
import { hashOpaqueToken } from "@/lib/security";

function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"•".repeat(Math.max(3, local.length - visible.length))}@${domain}`;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await prisma.organizationInvite.findUnique({
    where: { tokenHash: hashOpaqueToken(token) },
    include: { organization: { select: { name: true, slug: true } } },
  });
  if (!invite) return NextResponse.json({ error: "invitation not found" }, { status: 404 });
  const status = invite.acceptedAt ? "accepted" : invite.expiresAt <= new Date() ? "expired" : "valid";
  return NextResponse.json({
    organization: invite.organization,
    email: maskEmail(invite.email),
    role: invite.role,
    expiresAt: invite.expiresAt,
    status,
  });
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) return NextResponse.json({ error: "authentication required" }, { status: 401 });
  if (!(await hasVerifiedIdentity(session.user.id))) return NextResponse.json({ error: "verified identity required" }, { status: 403 });
  const { token } = await params;
  const invite = await prisma.organizationInvite.findUnique({ where: { tokenHash: hashOpaqueToken(token) } });
  if (!invite || invite.acceptedAt || invite.expiresAt <= new Date()) return NextResponse.json({ error: "invalid or expired invitation" }, { status: 410 });
  if (normalizeEmail(session.user.email) !== invite.email) return NextResponse.json({ error: "invitation email does not match signed-in identity" }, { status: 403 });

  const developer = await prisma.$transaction(async (tx) => {
    await tx.organizationMembership.upsert({
      where: { userId_orgId: { userId: session.user.id, orgId: invite.orgId } },
      update: { role: invite.role },
      create: { userId: session.user.id, orgId: invite.orgId, role: invite.role },
    });
    const linked = await linkDeveloperToUser({ tx, orgId: invite.orgId, userId: session.user.id, email: invite.email, name: session.user.name, role: invite.role });
    await tx.organizationInvite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } });
    return linked;
  });
  await audit({ orgId: invite.orgId, actorType: "user", actorId: session.user.id, action: "invite.accepted", targetType: "developer", targetId: developer.id });
  const response = NextResponse.json({ orgId: invite.orgId, developerId: developer.id, role: invite.role });
  response.cookies.set(ACTIVE_ORG_COOKIE, invite.orgId, activeOrgCookieOptions());
  return response;
}
