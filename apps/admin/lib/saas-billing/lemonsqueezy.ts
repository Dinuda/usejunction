/**
 * Lemon Squeezy client for UseJunction SaaS subscriptions.
 */
import { createCheckout, getCustomer, getSubscription } from "@lemonsqueezy/lemonsqueezy.js";
import { prisma } from "@usejunction/db";
import { PAID_SUBSCRIPTION_STATUSES } from "@/lib/saas-billing/entitlements";
import {
  ensureLemonSqueezyConfigured,
  getAppBaseUrl,
  requireLemonEnv,
} from "@/lib/saas-billing/lemonsqueezy-setup";

export { ensureLemonSqueezyConfigured, getAppBaseUrl } from "@/lib/saas-billing/lemonsqueezy-setup";
export {
  assertCanAddDeveloperSeat,
  setSubscriptionQuantity,
  syncSubscriptionQuantityForOrg,
  wouldConsumeDeveloperSeat,
} from "@/lib/saas-billing/quantity";

export async function createTeamCheckout(input: {
  orgId: string;
  email: string;
  name?: string | null;
  quantity: number;
}) {
  ensureLemonSqueezyConfigured();

  const storeId = requireLemonEnv("LEMONSQUEEZY_STORE_ID");
  const variantId = requireLemonEnv("LEMONSQUEEZY_VARIANT_ID_TEAM");
  const quantity = Math.max(1, input.quantity);

  const response = await createCheckout(storeId, variantId, {
    productOptions: {
      redirectUrl: `${getAppBaseUrl()}/dashboard?upgraded=1`,
    },
    checkoutData: {
      email: input.email,
      name: input.name ?? undefined,
      custom: {
        org_id: input.orgId,
      },
      variantQuantities: [
        {
          variantId: Number(variantId),
          quantity,
        },
      ],
    },
    checkoutOptions: {
      subscriptionPreview: true,
    },
  });

  if (response.error) {
    throw response.error;
  }

  const url = response.data?.data.attributes.url;
  if (!url) {
    throw new Error("checkout URL missing from Lemon Squeezy response");
  }

  return url;
}

export async function getCustomerPortalUrl(customerId: string) {
  ensureLemonSqueezyConfigured();
  const response = await getCustomer(customerId);
  if (response.error) {
    throw response.error;
  }

  const url = response.data?.data.attributes.urls.customer_portal;
  if (!url) {
    throw new Error("customer portal URL unavailable");
  }

  return url;
}

type SubscriptionWebhookAttributes = {
  status: string;
  customer_id: number;
  variant_id: number;
  renews_at: string | null;
  ends_at: string | null;
  user_email: string;
  first_subscription_item?: {
    id: number;
    quantity: number;
  } | null;
};

export async function applySubscriptionWebhook(input: {
  orgId: string;
  subscriptionId: string;
  attributes: SubscriptionWebhookAttributes;
}) {
  const { orgId, subscriptionId, attributes } = input;
  const status = attributes.status;
  const isPaid = PAID_SUBSCRIPTION_STATUSES.has(status);
  const quantity = attributes.first_subscription_item?.quantity;

  await prisma.organization.update({
    where: { id: orgId },
    data: {
      plan: isPaid ? "team" : "community",
      subscriptionStatus: status,
      lemonSqueezyCustomerId: String(attributes.customer_id),
      lemonSqueezySubscriptionId: subscriptionId,
      lemonSqueezyVariantId: String(attributes.variant_id),
      ...(typeof quantity === "number" ? { lemonSqueezyQuantity: quantity } : {}),
      billingEmail: attributes.user_email,
      currentPeriodEnd: attributes.renews_at
        ? new Date(attributes.renews_at)
        : attributes.ends_at
          ? new Date(attributes.ends_at)
          : null,
    },
  });
}

export async function markSubscriptionExpired(orgId: string) {
  await prisma.organization.update({
    where: { id: orgId },
    data: {
      plan: "community",
      subscriptionStatus: "expired",
      currentPeriodEnd: null,
    },
  });
}

export async function markSubscriptionPaymentFailed(orgId: string, status: string) {
  await prisma.organization.update({
    where: { id: orgId },
    data: {
      subscriptionStatus: status,
    },
  });
}

export async function refreshSubscriptionFromApi(orgId: string, subscriptionId: string) {
  ensureLemonSqueezyConfigured();
  const response = await getSubscription(subscriptionId);
  if (response.error) {
    throw response.error;
  }

  const attributes = response.data?.data.attributes;
  if (!attributes) {
    throw new Error("subscription not found");
  }

  await applySubscriptionWebhook({
    orgId,
    subscriptionId,
    attributes: {
      status: attributes.status,
      customer_id: attributes.customer_id,
      variant_id: attributes.variant_id,
      renews_at: attributes.renews_at,
      ends_at: attributes.ends_at,
      user_email: attributes.user_email,
      first_subscription_item: attributes.first_subscription_item
        ? {
            id: attributes.first_subscription_item.id,
            quantity: attributes.first_subscription_item.quantity,
          }
        : null,
    },
  });
}

export function extractOrgIdFromWebhook(meta: { custom_data?: Record<string, unknown> | null }): string | null {
  const orgId = meta.custom_data?.org_id;
  return typeof orgId === "string" && orgId.length > 0 ? orgId : null;
}
