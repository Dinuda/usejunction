import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@usejunction/db";
import {
  applySubscriptionWebhook,
  extractOrgIdFromWebhook,
  markSubscriptionExpired,
  markSubscriptionPaymentFailed,
} from "@/lib/saas-billing/lemonsqueezy";
import { syncTeamSeatQuantityBestEffort } from "@/lib/saas-billing/quantity";
import { audit } from "@/lib/rbac";

type WebhookPayload = {
  meta: {
    event_name: string;
    custom_data?: Record<string, unknown> | null;
  };
  data: {
    id: string;
    attributes: {
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
  };
};

async function resolveOrgId(payload: WebhookPayload): Promise<string | null> {
  const fromMeta = extractOrgIdFromWebhook(payload.meta);
  if (fromMeta) return fromMeta;

  const subscriptionId = payload.data.id;
  const org = await prisma.organization.findFirst({
    where: { lemonSqueezySubscriptionId: subscriptionId },
    select: { id: true },
  });
  return org?.id ?? null;
}

export async function POST(request: NextRequest) {
  const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ error: "webhook secret not configured" }, { status: 500 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get("x-signature") ?? "";
  const digest = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");

  const digestBuffer = Buffer.from(digest, "utf8");
  const signatureBuffer = Buffer.from(signature, "utf8");
  if (digestBuffer.length !== signatureBuffer.length || !crypto.timingSafeEqual(digestBuffer, signatureBuffer)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let payload: WebhookPayload;
  try {
    payload = JSON.parse(rawBody) as WebhookPayload;
  } catch {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }

  const eventName = payload.meta.event_name;
  const orgId = await resolveOrgId(payload);
  const isCreateOrUpdate =
    eventName === "subscription_created" ||
    eventName === "subscription_updated" ||
    eventName === "subscription_resumed" ||
    eventName === "subscription_paused" ||
    eventName === "subscription_unpaused" ||
    eventName === "subscription_cancelled";

  if (!orgId) {
    console.warn("[webhooks/lemonsqueezy] missing org_id for", eventName);
    if (eventName === "subscription_created") {
      return NextResponse.json({ error: "missing org_id in custom_data" }, { status: 400 });
    }
    return NextResponse.json({ received: true });
  }

  try {
    switch (eventName) {
      case "subscription_created":
      case "subscription_updated":
      case "subscription_resumed":
      case "subscription_paused":
      case "subscription_unpaused":
      case "subscription_cancelled":
        await applySubscriptionWebhook({
          orgId,
          subscriptionId: payload.data.id,
          attributes: payload.data.attributes,
        });
        break;
      case "subscription_expired":
        await markSubscriptionExpired(orgId);
        break;
      case "subscription_payment_failed":
        await markSubscriptionPaymentFailed(orgId, payload.data.attributes.status);
        break;
      default:
        break;
    }

    if (
      eventName === "subscription_created" ||
      eventName === "subscription_updated" ||
      eventName === "subscription_resumed"
    ) {
      await syncTeamSeatQuantityBestEffort(orgId, `webhook.${eventName}`);
    }

    if (isCreateOrUpdate || eventName === "subscription_expired" || eventName === "subscription_payment_failed") {
      await audit({
        orgId,
        actorType: "system",
        action: `billing.webhook.${eventName}`,
        targetType: "organization",
        targetId: orgId,
        metadata: { subscriptionId: payload.data.id, status: payload.data.attributes.status },
      });
    }
  } catch (error) {
    console.error("[webhooks/lemonsqueezy]", eventName, error);
    return NextResponse.json({ error: "webhook processing failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
