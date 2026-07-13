import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { ensureOwnerWorkspace } from "@/lib/ensure-workspace";
import { resolveOrgId } from "@/lib/require-organization";
import { prisma } from "@usejunction/db";

const updateSchema = z.object({ action: z.enum(["complete", "skip", "dismiss_checklist", "reopen_checklist"]) });

export async function POST() {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await ensureOwnerWorkspace({
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
  });

  const organization = await prisma.organization.findUnique({
    where: { id: result.orgId },
    select: { id: true, name: true, slug: true },
  });

  return NextResponse.json(
    {
      orgId: result.orgId,
      organizationName: organization?.name,
      slug: organization?.slug,
      alreadyConfigured: !result.created,
    },
    { status: result.created ? 201 : 200 },
  );
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const orgId = await resolveOrgId(session.user.id, session.user.orgId);
  if (!orgId) {
    return NextResponse.json({ configured: false, role: null, currentStep: "install" });
  }

  const membership = await prisma.organizationMembership.findUnique({
    where: { userId_orgId: { userId: session.user.id, orgId } },
    include: {
      organization: {
        select: {
          id: true,
          name: true,
          slug: true,
          _count: { select: { invites: true, developers: true, devices: true } },
        },
      },
    },
  });

  if (!membership) {
    return NextResponse.json({ configured: false, role: null, currentStep: "install" });
  }

  const developer = await prisma.developer.findFirst({
    where: { orgId, authUserId: session.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      devices: {
        orderBy: { lastSeenAt: "desc" },
        select: {
          id: true,
          hostname: true,
          os: true,
          architecture: true,
          agentVersion: true,
          lastSeenAt: true,
          toolInstallations: {
            where: { detected: true },
            select: { toolName: true, version: true, lastCheckedAt: true },
          },
        },
      },
    },
  });

  const deviceConnected = Boolean(developer?.devices.length);
  const teamInvited =
    membership.organization._count.invites > 0 || membership.organization._count.developers > 1;

  return NextResponse.json({
    configured: true,
    role: membership.role,
    currentStep: deviceConnected ? "complete" : "install",
    onboardingCompletedAt: membership.onboardingCompletedAt,
    setupChecklistDismissedAt: membership.setupChecklistDismissedAt,
    organization: {
      id: membership.organization.id,
      name: membership.organization.name,
      slug: membership.organization.slug,
    },
    developer,
    steps: {
      install: deviceConnected,
      team: teamInvited,
    },
  });
}

export async function PATCH(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = updateSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid onboarding action" }, { status: 400 });

  const orgId = await resolveOrgId(session.user.id, session.user.orgId);
  if (!orgId) return NextResponse.json({ error: "organization setup required" }, { status: 409 });

  const membership = await prisma.organizationMembership.findUnique({
    where: { userId_orgId: { userId: session.user.id, orgId } },
  });
  if (!membership) return NextResponse.json({ error: "organization setup required" }, { status: 409 });

  const now = new Date();
  const data =
    parsed.data.action === "complete" || parsed.data.action === "skip"
      ? { onboardingCompletedAt: now }
      : parsed.data.action === "dismiss_checklist"
        ? { setupChecklistDismissedAt: now }
        : { setupChecklistDismissedAt: null };

  const updated = await prisma.organizationMembership.update({ where: { id: membership.id }, data });
  return NextResponse.json({
    onboardingCompletedAt: updated.onboardingCompletedAt,
    setupChecklistDismissedAt: updated.setupChecklistDismissedAt,
  });
}
