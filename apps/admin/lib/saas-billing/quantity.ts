import { prisma } from "@usejunction/db";
import { getSubscription, updateSubscriptionItem } from "@lemonsqueezy/lemonsqueezy.js";
import { ensureLemonSqueezyConfigured } from "@/lib/saas-billing/lemonsqueezy-setup";
import { activeSeatQuantity } from "@/lib/saas-billing/seats";
import { audit } from "@/lib/rbac";
import { logServerError } from "@/lib/errors/public";

const SYNCABLE_TEAM_STATUSES = new Set(["active", "on_trial"]);
const MAX_CONVERGENCE_ATTEMPTS = 3;

export type TeamSeatSyncResult = {
  status: "synced" | "unchanged" | "skipped";
  quantity: number;
};

async function activeDeveloperCount(orgId: string) {
  return prisma.developer.count({ where: { orgId, removedAt: null } });
}

/**
 * Make Lemon's quantity equal the active Team roster.
 *
 * Quantity changes use Lemon's deferred-proration behavior: access changes now,
 * while the prorated debit or credit is included on the next renewal invoice.
 */
export async function syncTeamSeatQuantity(
  orgId: string,
  options: { verifyRemote?: boolean } = {},
): Promise<TeamSeatSyncResult> {
  let lastQuantity = activeSeatQuantity(await activeDeveloperCount(orgId));

  for (let attempt = 0; attempt < MAX_CONVERGENCE_ATTEMPTS; attempt += 1) {
    const [org, count] = await Promise.all([
      prisma.organization.findUnique({
        where: { id: orgId },
        select: {
          plan: true,
          subscriptionStatus: true,
          lemonSqueezySubscriptionId: true,
          lemonSqueezyQuantity: true,
        },
      }),
      activeDeveloperCount(orgId),
    ]);
    const quantity = activeSeatQuantity(count);
    lastQuantity = quantity;

    if (
      !org ||
      org.plan !== "team" ||
      !org.lemonSqueezySubscriptionId ||
      !org.subscriptionStatus ||
      !SYNCABLE_TEAM_STATUSES.has(org.subscriptionStatus)
    ) {
      return { status: "skipped", quantity };
    }

    if (org.lemonSqueezyQuantity === quantity && !options.verifyRemote) {
      return { status: "unchanged", quantity };
    }

    ensureLemonSqueezyConfigured();
    const subscription = await getSubscription(org.lemonSqueezySubscriptionId);
    if (subscription.error) throw subscription.error;

    const item = subscription.data?.data.attributes.first_subscription_item;
    if (!item?.id) throw new Error("subscription item missing for quantity update");

    if (item.quantity === quantity) {
      if (org.lemonSqueezyQuantity !== quantity) {
        await prisma.organization.update({
          where: { id: orgId },
          data: { lemonSqueezyQuantity: quantity },
        });
      }
      return { status: "unchanged", quantity };
    }

    const updated = await updateSubscriptionItem(item.id, {
      quantity,
      invoiceImmediately: false,
      disableProrations: false,
    });
    if (updated.error) throw updated.error;

    await prisma.organization.update({
      where: { id: orgId },
      data: { lemonSqueezyQuantity: quantity },
    });

    const latestQuantity = activeSeatQuantity(await activeDeveloperCount(orgId));
    if (latestQuantity === quantity) {
      return { status: "synced", quantity };
    }
  }

  throw new Error(`Team seat quantity did not stabilize at ${lastQuantity}`);
}

/** Keep roster mutations available when Lemon is temporarily unavailable. */
export async function syncTeamSeatQuantityBestEffort(orgId: string, source: string) {
  try {
    return await syncTeamSeatQuantity(orgId);
  } catch (error) {
    logServerError("billing/seat-sync", error, { source, orgId });
    try {
      await audit({
        orgId,
        actorType: "system",
        action: "billing.seat_sync_failed",
        targetType: "organization",
        targetId: orgId,
        metadata: {
          source,
          error: error instanceof Error ? error.message.slice(0, 500) : "unknown error",
        },
      });
    } catch (auditError) {
      logServerError("billing/seat-sync", auditError, { phase: "failure audit", orgId });
    }
    return null;
  }
}

/** Backwards-compatible name for existing internal roster-removal callers. */
export const syncSubscriptionQuantityForOrg = syncTeamSeatQuantity;
