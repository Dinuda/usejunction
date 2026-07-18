import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@usejunction/db";
import { hasVerifiedIdentity, linkDeveloperToUser, normalizeEmail } from "@/lib/developer-identity";
import { assertCanAddDeveloperSeat } from "@/lib/saas-billing/quantity";
import { ACTIVE_ORG_COOKIE, activeOrgCookieOptions } from "@/lib/require-organization";
import { audit } from "@/lib/rbac";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) return NextResponse.json({ error: "authentication required" }, { status: 401 });
  if (!(await hasVerifiedIdentity(session.user.id))) return NextResponse.json({ error: "verified identity required" }, { status: 403 });
  const { slug } = await params;
  const email = normalizeEmail(session.user.email);
  const emailDomain = email.split("@")[1];
  const organization = await prisma.organization.findUnique({ where: { slug }, select: { id: true } });
  if (!organization) return NextResponse.json({ error: "organization not found" }, { status: 404 });
  const domain = await prisma.organizationDomain.findFirst({ where: { orgId: organization.id, domain: emailDomain, verifiedAt: { not: null } } });
  if (!domain) return NextResponse.json({ error: "a verified organization domain or invitation is required" }, { status: 403 });

  const seatGate = await assertCanAddDeveloperSeat({
    orgId: organization.id,
    userId: session.user.id,
    email,
  });
  if (!seatGate.allowed) {
    return NextResponse.json({ error: seatGate.message }, { status: 403 });
  }

  const developer = await prisma.$transaction(async (tx) => {
    await tx.organizationMembership.upsert({
      where: { userId_orgId: { userId: session.user.id, orgId: organization.id } },
      update: {},
      create: { userId: session.user.id, orgId: organization.id, role: "user" },
    });
    return linkDeveloperToUser({ tx, orgId: organization.id, userId: session.user.id, email, name: session.user.name });
  });
  await audit({ orgId: organization.id, actorType: "user", actorId: session.user.id, action: "domain_join.accepted", targetType: "developer", targetId: developer.id, metadata: { domain: emailDomain } });
  const response = NextResponse.json({ orgId: organization.id, developerId: developer.id, role: "user" });
  response.cookies.set(ACTIVE_ORG_COOKIE, organization.id, activeOrgCookieOptions());
  return response;
}
