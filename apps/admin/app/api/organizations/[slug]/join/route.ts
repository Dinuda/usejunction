import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@usejunction/db";
import { hasVerifiedIdentity, linkDeveloperToUser, normalizeEmail } from "@/lib/developer-identity";
import { syncTeamSeatQuantityBestEffort } from "@/lib/saas-billing/quantity";
import { assertCanAddUser } from "@/lib/saas-billing/status";
import { audit } from "@/lib/rbac";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const organization = await prisma.organization.findUnique({
    where: { slug: (await params).slug },
    select: { name: true, domains: { where: { verifiedAt: { not: null } }, select: { id: true }, take: 1 } },
  });
  if (!organization || organization.domains.length === 0) {
    return NextResponse.json({ error: "company join unavailable" }, { status: 404, headers: { "cache-control": "private, no-store" } });
  }
  return NextResponse.json({ name: organization.name, available: true }, { headers: { "cache-control": "private, no-store" } });
}

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
  const userGate = await assertCanAddUser(organization.id, { userId: session.user.id, email });
  if (!userGate.allowed) return NextResponse.json({ error: userGate.message }, { status: 403 });

  const developer = await prisma.$transaction(async (tx) => {
    await tx.organizationMembership.upsert({
      where: { userId_orgId: { userId: session.user.id, orgId: organization.id } },
      update: {},
      create: { userId: session.user.id, orgId: organization.id, role: "user" },
    });
    return linkDeveloperToUser({ tx, orgId: organization.id, userId: session.user.id, email, name: session.user.name });
  });
  await syncTeamSeatQuantityBestEffort(organization.id, "domain_join.accepted");
  await audit({ orgId: organization.id, actorType: "user", actorId: session.user.id, action: "domain_join.accepted", targetType: "developer", targetId: developer.id, metadata: { domain: emailDomain } });
  return NextResponse.json({ orgId: organization.id, developerId: developer.id, role: "user" });
}
