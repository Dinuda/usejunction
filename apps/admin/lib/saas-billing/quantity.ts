import { prisma, type Prisma } from "@usejunction/db";
import { getSubscription, updateSubscriptionItem } from "@lemonsqueezy/lemonsqueezy.js";
import {
  isPaidPlan,
  PAID_SUBSCRIPTION_STATUSES,
  resolveEffectivePlan,
} from "@/lib/saas-billing/entitlements";
import { evaluateSeatCapacity, type SeatCapacityDecision } from "@/lib/saas-billing/seats";
import { ensureLemonSqueezyConfigured } from "@/lib/saas-billing/lemonsqueezy-setup";
import { normalizeEmail } from "@/lib/developer-identity";

export { evaluateSeatCapacity, resolveCheckoutQuantity, MAX_TEAM_SEATS } from "@/lib/saas-billing/seats";
export type { ResolveCheckoutQuantityResult, SeatCapacityDecision } from "@/lib/saas-billing/seats";

async function countActiveDevelopers(orgId: string, tx?: Prisma.TransactionClient) {
  const client = tx ?? prisma;
  return client.developer.count({ where: { orgId, removedAt: null } });
}

/** Whether linking this user/email would consume a new active seat. */
export async function wouldConsumeDeveloperSeat(input: {
  orgId: string;
  userId: string;
  email: string;
  tx?: Prisma.TransactionClient;
}): Promise<boolean> {
  const client = input.tx ?? prisma;
  const email = normalizeEmail(input.email);

  const existingByUser = await client.developer.findFirst({
    where: { orgId: input.orgId, authUserId: input.userId },
    select: { removedAt: true },
  });
  if (existingByUser && !existingByUser.removedAt) {
    return false;
  }

  const existingByEmail = await client.developer.findFirst({
    where: { orgId: input.orgId, email },
    select: { removedAt: true, authUserId: true },
  });
  if (existingByEmail && !existingByEmail.removedAt) {
    return false;
  }

  return true;
}

export async function assertCanAddDeveloperSeat(input: {
  orgId: string;
  userId: string;
  email: string;
  tx?: Prisma.TransactionClient;
}): Promise<SeatCapacityDecision> {
  const client = input.tx ?? prisma;
  const org = await client.organization.findUnique({
    where: { id: input.orgId },
    select: {
      plan: true,
      trialEndsAt: true,
      subscriptionStatus: true,
      currentPeriodEnd: true,
      lemonSqueezyQuantity: true,
    },
  });

  if (!org) {
    return { allowed: false, message: "organization not found" };
  }

  const effectivePlan = resolveEffectivePlan(org);
  const paid = isPaidPlan(effectivePlan);
  const consume = await wouldConsumeDeveloperSeat(input);
  const activeDeveloperCount = await countActiveDevelopers(input.orgId, input.tx);

  return evaluateSeatCapacity({
    isPaidPlan: paid,
    purchasedSeats: org.lemonSqueezyQuantity,
    activeDeveloperCount,
    wouldConsumeSeat: consume,
  });
}

/** Set Lemon subscription item quantity and persist on the org. */
export async function setSubscriptionQuantity(orgId: string, quantity: number): Promise<void> {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: {
      lemonSqueezySubscriptionId: true,
      lemonSqueezyQuantity: true,
      subscriptionStatus: true,
      plan: true,
    },
  });

  if (!org?.lemonSqueezySubscriptionId) {
    throw new Error("no subscription to update");
  }
  if (!org.subscriptionStatus || !PAID_SUBSCRIPTION_STATUSES.has(org.subscriptionStatus)) {
    throw new Error("subscription is not active");
  }
  if (org.plan !== "team" && org.plan !== "enterprise") {
    throw new Error("organization is not on a paid plan");
  }

  const developerCount = await countActiveDevelopers(orgId);
  const minSeats = Math.max(1, developerCount);
  if (quantity < minSeats) {
    throw new Error(`quantity must be at least ${minSeats}`);
  }
  if (org.lemonSqueezyQuantity === quantity) {
    return;
  }

  ensureLemonSqueezyConfigured();
  const subscription = await getSubscription(org.lemonSqueezySubscriptionId);
  if (subscription.error) {
    throw subscription.error;
  }

  const itemId = subscription.data?.data.attributes.first_subscription_item?.id;
  if (!itemId) {
    throw new Error("subscription item missing for quantity update");
  }

  const updated = await updateSubscriptionItem(itemId, {
    quantity,
    invoiceImmediately: false,
  });
  if (updated.error) {
    throw updated.error;
  }

  await prisma.organization.update({
    where: { id: orgId },
    data: { lemonSqueezyQuantity: quantity },
  });
}

/** Align Lemon seat quantity down to active developer roster count. */
export async function syncSubscriptionQuantityForOrg(orgId: string): Promise<void> {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: {
      lemonSqueezySubscriptionId: true,
      lemonSqueezyQuantity: true,
      subscriptionStatus: true,
      plan: true,
    },
  });

  if (!org?.lemonSqueezySubscriptionId) return;
  if (!org.subscriptionStatus || !PAID_SUBSCRIPTION_STATUSES.has(org.subscriptionStatus)) return;
  if (org.plan !== "team" && org.plan !== "enterprise") return;

  const developerCount = await countActiveDevelopers(orgId);
  const quantity = Math.max(1, developerCount);
  if (org.lemonSqueezyQuantity === quantity) return;

  await setSubscriptionQuantity(orgId, quantity);
}
