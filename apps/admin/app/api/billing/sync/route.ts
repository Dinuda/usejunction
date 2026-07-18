import { NextResponse } from "next/server";
import { prisma } from "@usejunction/db";
import { refreshSubscriptionFromApi } from "@/lib/saas-billing/lemonsqueezy";
import { publicErrorResponse } from "@/lib/errors/public";
import { audit, rolesFor } from "@/lib/rbac";
import { requireWorkspaceRole } from "@/lib/workspace-context";

/** Repair org SaaS status from Lemon Squeezy after a missed webhook. */
export async function POST() {
  const ctx = await requireWorkspaceRole(rolesFor("settings_billing"));

  const org = await prisma.organization.findUnique({
    where: { id: ctx.orgId },
    select: { lemonSqueezySubscriptionId: true },
  });

  if (!org?.lemonSqueezySubscriptionId) {
    return NextResponse.json({ error: "no subscription to sync" }, { status: 404 });
  }

  try {
    await refreshSubscriptionFromApi(ctx.orgId, org.lemonSqueezySubscriptionId);

    await audit({
      orgId: ctx.orgId,
      actorType: "user",
      actorId: ctx.userId,
      action: "billing.subscription_synced",
      targetType: "organization",
      targetId: ctx.orgId,
      metadata: { subscriptionId: org.lemonSqueezySubscriptionId },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return publicErrorResponse("billing/sync", error, "Subscription sync unavailable.", 500);
  }
}
