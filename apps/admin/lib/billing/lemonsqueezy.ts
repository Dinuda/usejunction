import {
  createCheckout,
  getCustomer,
  getSubscription,
  lemonSqueezySetup,
} from "@lemonsqueezy/lemonsqueezy.js";
import { prisma } from "@usejunction/db";

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is not configured`);
  }
  return value;
}

let configured = false;

export function ensureLemonSqueezyConfigured() {
  if (configured) return;
  const apiKey = requireEnv("LEMONSQUEEZY_API_KEY");
  lemonSqueezySetup({ apiKey });
  configured = true;
}

export function getAppBaseUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3001").replace(/\/$/, "");
}

export async function createTeamCheckout(input: {
  orgId: string;
  email: string;
  name?: string | null;
  quantity: number;
}) {
  ensureLemonSqueezyConfigured();

  const storeId = requireEnv("LEMONSQUEEZY_STORE_ID");
  const variantId = requireEnv("LEMONSQUEEZY_VARIANT_ID_TEAM");
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
};

export async function applySubscriptionWebhook(input: {
  orgId: string;
  subscriptionId: string;
  attributes: SubscriptionWebhookAttributes;
}) {
  const { orgId, subscriptionId, attributes } = input;
  const status = attributes.status;
  const isPaid = status === "active" || status === "on_trial" || status === "cancelled" || status === "paused";

  await prisma.organization.update({
    where: { id: orgId },
    data: {
      plan: isPaid ? "team" : "community",
      subscriptionStatus: status,
      lemonSqueezyCustomerId: String(attributes.customer_id),
      lemonSqueezySubscriptionId: subscriptionId,
      lemonSqueezyVariantId: String(attributes.variant_id),
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
    },
  });
}

export function extractOrgIdFromWebhook(meta: { custom_data?: Record<string, unknown> | null }): string | null {
  const orgId = meta.custom_data?.org_id;
  return typeof orgId === "string" && orgId.length > 0 ? orgId : null;
}
