/**
 * UseJunction SaaS billing (Lemon Squeezy).
 * Junction charges customers for the product — not vendor tool seat accounting.
 */
export type SaasPlan = "community" | "team" | "enterprise";

export const USER_LIMIT_FREE = 5;
export const TEAM_PRICE_PER_DEV_USD = 8;

export type OrgBillingFields = {
  plan: string;
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

  return "community";
}

export function getUserLimit(effectivePlan: SaasPlan): number | null {
  if (effectivePlan === "team" || effectivePlan === "enterprise") {
    return null;
  }
  return USER_LIMIT_FREE;
}

export function getPlanDisplayName(effectivePlan: SaasPlan): string {
  switch (effectivePlan) {
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
