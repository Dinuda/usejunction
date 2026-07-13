import { NextResponse } from "next/server";
import { prisma } from "@usejunction/db";
import { createTeamCheckout } from "@/lib/billing/lemonsqueezy";
import { audit } from "@/lib/rbac";
import { requireWorkspaceRole } from "@/lib/workspace-context";

export async function POST() {
  const ctx = await requireWorkspaceRole(["owner", "admin"]);

  const [developerCount, org] = await Promise.all([
    prisma.developer.count({ where: { orgId: ctx.orgId } }),
    prisma.organization.findUnique({
      where: { id: ctx.orgId },
      select: { plan: true, subscriptionStatus: true },
    }),
  ]);

  if (!org) {
    return NextResponse.json({ error: "organization not found" }, { status: 404 });
  }

  if (org.plan === "team" || org.plan === "enterprise") {
    if (org.subscriptionStatus === "active" || org.subscriptionStatus === "on_trial" || org.subscriptionStatus === "cancelled") {
      return NextResponse.json({ error: "organization already has an active subscription" }, { status: 409 });
    }
  }

  try {
    const url = await createTeamCheckout({
      orgId: ctx.orgId,
      email: ctx.email,
      name: ctx.name,
      quantity: Math.max(developerCount, 1),
    });

    await audit({
      orgId: ctx.orgId,
      actorType: "user",
      actorId: ctx.userId,
      action: "billing.checkout_created",
      targetType: "organization",
      targetId: ctx.orgId,
      metadata: { quantity: Math.max(developerCount, 1) },
    });

    return NextResponse.json({ url });
  } catch (error) {
    console.error("[billing/checkout]", error);
    const message = error instanceof Error ? error.message : "checkout failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
