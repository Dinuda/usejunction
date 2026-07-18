import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@usejunction/db";
import { createTeamCheckout } from "@/lib/saas-billing/lemonsqueezy";
import { BLOCK_CHECKOUT_STATUSES } from "@/lib/saas-billing/entitlements";
import { resolveCheckoutQuantity } from "@/lib/saas-billing/seats";
import { publicErrorResponse } from "@/lib/errors/public";
import { audit, rolesFor } from "@/lib/rbac";
import { requireWorkspaceRole } from "@/lib/workspace-context";

export async function POST(req: NextRequest) {
  const ctx = await requireWorkspaceRole(rolesFor("settings_billing"));

  const body = (await req.json().catch(() => ({}))) as { quantity?: unknown };
  const requested =
    typeof body.quantity === "number"
      ? body.quantity
      : typeof body.quantity === "string" && body.quantity.trim() !== ""
        ? Number(body.quantity)
        : null;

  const [developerCount, org] = await Promise.all([
    prisma.developer.count({ where: { orgId: ctx.orgId, removedAt: null } }),
    prisma.organization.findUnique({
      where: { id: ctx.orgId },
      select: { plan: true, subscriptionStatus: true, lemonSqueezyCustomerId: true },
    }),
  ]);

  if (!org) {
    return NextResponse.json({ error: "organization not found" }, { status: 404 });
  }

  const status = org.subscriptionStatus;
  if (
    (org.plan === "team" || org.plan === "enterprise") &&
    status &&
    BLOCK_CHECKOUT_STATUSES.has(status)
  ) {
    return NextResponse.json(
      { error: "organization already has an active subscription — use Manage billing" },
      { status: 409 },
    );
  }

  const resolved = resolveCheckoutQuantity({
    activeDeveloperCount: developerCount,
    requested: Number.isFinite(requested as number) ? (requested as number) : null,
  });
  if (!resolved.ok) {
    return NextResponse.json({ error: resolved.error, minSeats: resolved.minSeats }, { status: 400 });
  }

  try {
    const url = await createTeamCheckout({
      orgId: ctx.orgId,
      email: ctx.email,
      name: ctx.name,
      quantity: resolved.quantity,
    });

    await audit({
      orgId: ctx.orgId,
      actorType: "user",
      actorId: ctx.userId,
      action: "billing.checkout_created",
      targetType: "organization",
      targetId: ctx.orgId,
      metadata: { quantity: resolved.quantity, minSeats: resolved.minSeats },
    });

    return NextResponse.json({ url, quantity: resolved.quantity });
  } catch (error) {
    return publicErrorResponse("billing/checkout", error, "Checkout unavailable.", 500);
  }
}
