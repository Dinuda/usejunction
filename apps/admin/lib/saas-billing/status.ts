import { prisma } from "@usejunction/db";
import type { OrganizationRole } from "@/lib/workspace-context";
import { canManageSettings } from "@/lib/rbac/permissions";
import {
  getPlanDisplayName,
  getUserLimit,
  isPaidPlan,
  resolveEffectivePlan,
  type SaasPlan,
} from "@/lib/saas-billing/entitlements";

export type OrgBillingStatus = {
  plan: string;
  effectivePlan: SaasPlan;
  planLabel: string;
  subscriptionStatus: string | null;
  usersUsed: number;
  usersLimit: number | null;
  usagePercent: number | null;
  canUpgrade: boolean;
  canManage: boolean;
  isAtUserLimit: boolean;
  billingSeatQuantity: number | null;
  seatSyncPending: boolean;
};

export type OrgBillingFacts = {
  plan: string;
  subscriptionStatus: string | null;
  currentPeriodEnd: Date | null;
  lemonSqueezyCustomerId: string | null;
  lemonSqueezySubscriptionId: string | null;
  lemonSqueezyQuantity: number | null;
  usersUsed: number;
};

export function computeOrgBillingStatus(
  facts: OrgBillingFacts,
  role: OrganizationRole | null,
): OrgBillingStatus {
  const effectivePlan = resolveEffectivePlan(facts);
  const usersLimit = getUserLimit(effectivePlan);
  const paid = isPaidPlan(effectivePlan);
  const isAdmin = canManageSettings(role);
  const desiredSeatQuantity = Math.max(1, facts.usersUsed);
  const billingSeatQuantity = effectivePlan === "team" ? facts.lemonSqueezyQuantity : null;
  const seatSyncPending =
    effectivePlan === "team" &&
    (facts.subscriptionStatus === "active" || facts.subscriptionStatus === "on_trial") &&
    billingSeatQuantity !== desiredSeatQuantity;
  let usagePercent: number | null = null;
  if (!paid && usersLimit !== null) {
    usagePercent = Math.min(100, Math.round((facts.usersUsed / usersLimit) * 100));
  }

  return {
    plan: facts.plan,
    effectivePlan,
    planLabel: getPlanDisplayName(effectivePlan),
    subscriptionStatus: facts.subscriptionStatus,
    usersUsed: facts.usersUsed,
    usersLimit,
    usagePercent,
    canUpgrade: isAdmin && !paid,
    canManage: isAdmin && paid && Boolean(facts.lemonSqueezyCustomerId),
    isAtUserLimit: usersLimit !== null && facts.usersUsed >= usersLimit,
    billingSeatQuantity,
    seatSyncPending,
  };
}

export async function getOrgBillingStatus(
  orgId: string,
  role: OrganizationRole | null,
): Promise<OrgBillingStatus> {
  const [org, usersUsed] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: orgId },
      select: {
        plan: true,
        subscriptionStatus: true,
        currentPeriodEnd: true,
        lemonSqueezyCustomerId: true,
        lemonSqueezySubscriptionId: true,
        lemonSqueezyQuantity: true,
      },
    }),
    prisma.developer.count({ where: { orgId, removedAt: null } }),
  ]);

  if (!org) {
    throw new Error("organization not found");
  }

  return computeOrgBillingStatus({ ...org, usersUsed }, role);
}

export async function assertCanEnrollDevice(
  orgId: string,
  developerId: string,
): Promise<{ allowed: true } | { allowed: false; message: string }> {
  const activeDevice = await prisma.device.findFirst({
    where: { orgId, userId: developerId, decommissionedAt: null },
    select: { id: true },
  });
  if (activeDevice) {
    return {
      allowed: false,
      message: "This user already has a device enrolled.",
    };
  }

  return { allowed: true };
}

export async function assertCanAddUser(
  orgId: string,
  identity: { userId: string; email: string },
): Promise<{ allowed: true } | { allowed: false; message: string }> {
  const [org, existingUser] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: orgId },
      select: {
        plan: true,
        subscriptionStatus: true,
        currentPeriodEnd: true,
      },
    }),
    prisma.developer.findFirst({
      where: {
        orgId,
        removedAt: null,
        OR: [
          { authUserId: identity.userId },
          { email: identity.email.trim().toLowerCase() },
        ],
      },
      select: { id: true },
    }),
  ]);

  if (!org) return { allowed: false, message: "organization not found" };
  if (existingUser) return { allowed: true };

  const limit = getUserLimit(resolveEffectivePlan(org));
  if (limit === null) return { allowed: true };

  const usersUsed = await prisma.developer.count({ where: { orgId, removedAt: null } });
  if (usersUsed >= limit) {
    return {
      allowed: false,
      message: `User limit reached (${limit}). Upgrade to Team to add more users.`,
    };
  }

  return { allowed: true };
}
