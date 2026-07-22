import { cookies } from "next/headers";
import { prisma } from "@usejunction/db";
import { ACTIVE_ORG_COOKIE } from "@/lib/require-organization";

export type OnboardingDeveloper = {
  id: string;
  name: string;
  email: string;
  devices: Array<{
    id: string;
    hostname: string;
    os: string;
    architecture: string;
    agentVersion: string;
    lastSeenAt: Date;
    toolInstallations: Array<{
      toolName: string;
      version: string | null;
      lastCheckedAt: Date | null;
    }>;
  }>;
};

export type OnboardingStatusPayload = {
  configured: boolean;
  role: string | null;
  currentStep: "install" | "complete";
  onboardingCompletedAt?: Date | null;
  setupChecklistDismissedAt?: Date | null;
  organization?: { id: string; name: string; slug: string };
  developer?: OnboardingDeveloper | null;
  steps?: { install: boolean; team: boolean };
};

const membershipSelect = {
  role: true,
  onboardingCompletedAt: true,
  setupChecklistDismissedAt: true,
  organization: {
    select: {
      id: true,
      name: true,
      slug: true,
      _count: { select: { invites: true, developers: true, devices: true } },
    },
  },
} as const;

async function resolveMembership(userId: string, sessionOrgId: string | null | undefined) {
  const cookieStore = await cookies();
  const cookieOrgId = cookieStore.get(ACTIVE_ORG_COOKIE)?.value;
  const candidateOrgId = cookieOrgId ?? sessionOrgId;

  if (candidateOrgId) {
    const membership = await prisma.organizationMembership.findUnique({
      where: { userId_orgId: { userId, orgId: candidateOrgId } },
      select: membershipSelect,
    });
    if (membership) return membership;
  }

  return prisma.organizationMembership.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: membershipSelect,
  });
}

async function loadDeveloper(userId: string, orgId: string): Promise<OnboardingDeveloper | null> {
  return prisma.developer.findFirst({
    where: { orgId, authUserId: userId },
    select: {
      id: true,
      name: true,
      email: true,
      devices: {
        where: { decommissionedAt: null },
        orderBy: { lastSeenAt: "desc" },
        take: 1,
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
}

function statusFromMembership(
  membership: NonNullable<Awaited<ReturnType<typeof resolveMembership>>>,
  developer: OnboardingDeveloper | null | undefined,
  includeDeveloper: boolean,
): OnboardingStatusPayload {
  const deviceConnected = Boolean(developer?.devices.length);
  const teamInvited =
    membership.organization._count.invites > 0 || membership.organization._count.developers > 1;

  return {
    configured: true,
    role: membership.role,
    currentStep: includeDeveloper && deviceConnected ? "complete" : "install",
    onboardingCompletedAt: membership.onboardingCompletedAt,
    setupChecklistDismissedAt: membership.setupChecklistDismissedAt,
    organization: {
      id: membership.organization.id,
      name: membership.organization.name,
      slug: membership.organization.slug,
    },
    ...(includeDeveloper ? { developer: developer ?? null } : {}),
    steps: {
      install: includeDeveloper ? deviceConnected : false,
      team: teamInvited,
    },
  };
}

/** True when the email has a redeemable org or connect invite and should not get a personal workspace. */
export async function hasPendingWorkspaceInvite(email: string): Promise<boolean> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return false;
  const now = new Date();
  const [orgInvite, connectInvite] = await Promise.all([
    prisma.organizationInvite.findFirst({
      where: { email: normalized, acceptedAt: null, expiresAt: { gt: now } },
      select: { id: true },
    }),
    prisma.connectInvite.findFirst({
      where: {
        email: normalized,
        status: "pending",
        usedAt: null,
        expiresAt: { gt: now },
      },
      select: { id: true },
    }),
  ]);
  return Boolean(orgInvite || connectInvite);
}

export async function buildOnboardingStatusForOrg(
  userId: string,
  orgId: string,
  options?: { includeDeveloper?: boolean },
): Promise<OnboardingStatusPayload> {
  const includeDeveloper = options?.includeDeveloper === true;
  const membership = await prisma.organizationMembership.findUnique({
    where: { userId_orgId: { userId, orgId } },
    select: membershipSelect,
  });
  if (!membership) {
    return { configured: false, role: null, currentStep: "install" };
  }

  const developer = includeDeveloper ? await loadDeveloper(userId, orgId) : undefined;
  return statusFromMembership(membership, developer, includeDeveloper);
}

export async function buildOnboardingStatus(
  userId: string,
  sessionOrgId: string | null | undefined,
  options?: { includeDeveloper?: boolean },
): Promise<OnboardingStatusPayload> {
  const includeDeveloper = options?.includeDeveloper === true;
  const membership = await resolveMembership(userId, sessionOrgId);
  if (!membership) {
    return { configured: false, role: null, currentStep: "install" };
  }

  const developer = includeDeveloper
    ? await loadDeveloper(userId, membership.organization.id)
    : undefined;
  return statusFromMembership(membership, developer, includeDeveloper);
}
