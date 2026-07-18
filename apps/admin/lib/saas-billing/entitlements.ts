/**
 * UseJunction SaaS billing (Lemon Squeezy).
 * Junction charges customers for the product — not vendor tool seat accounting.
 */
export type SaasPlan = "trial" | "community" | "team" | "enterprise";

export const TRIAL_DAYS = 14;
export const DEVICE_LIMIT_FREE = 10;
export const TEAM_PRICE_PER_DEV_USD = 12;

export type OrgBillingFields = {
  plan: string;
  trialEndsAt: Date | null;
  subscriptionStatus: string | null;
  currentPeriodEnd: Date | null;
};

export const PAID_SUBSCRIPTION_STATUSES = new Set(["active", "on_trial", "cancelled", "paused"]);

/** Statuses that should block a second checkout (use portal instead). */
export const BLOCK_CHECKOUT_STATUSES = new Set(["active", "on_trial", "paused"]);

export function resolveEffectivePlan(org: OrgBillingFields): SaasPlan {
  const plan = org.plan as SaasPlan;

  if (plan === "enterprise" && org.subscriptionStatus && PAID_SUBSCRIPTION_STATUSES.has(org.subscriptionStatus)) {
    return "enterprise";
  }

  if (plan === "team" && org.subscriptionStatus && PAID_SUBSCRIPTION_STATUSES.has(org.subscriptionStatus)) {
    return "team";
  }

  if (plan === "trial" && org.trialEndsAt && org.trialEndsAt > new Date()) {
    return "trial";
  }

  return "community";
}

export function getDeviceLimit(effectivePlan: SaasPlan): number | null {
  if (effectivePlan === "team" || effectivePlan === "enterprise") {
    return null;
  }
  return DEVICE_LIMIT_FREE;
}

export function getTrialDaysLeft(trialEndsAt: Date | null): number | null {
  if (!trialEndsAt) return null;
  const ms = trialEndsAt.getTime() - Date.now();
  if (ms <= 0) return 0;
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

export function getPlanDisplayName(effectivePlan: SaasPlan): string {
  switch (effectivePlan) {
    case "trial":
      return "Trial";
    case "community":
      return "Community";
    case "team":
      return "Team";
    case "enterprise":
      return "Enterprise";
    default:
      return "Community";
  }
}

export function isPaidPlan(effectivePlan: SaasPlan): boolean {
  return effectivePlan === "team" || effectivePlan === "enterprise";
}

export function trialEndsAtFromNow(days = TRIAL_DAYS): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}
