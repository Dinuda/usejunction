import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@usejunction/db";
import { setSubscriptionQuantity } from "@/lib/saas-billing/quantity";
import { MAX_TEAM_SEATS } from "@/lib/saas-billing/seats";
import { publicErrorResponse } from "@/lib/errors/public";
import { audit, rolesFor } from "@/lib/rbac";
import { requireWorkspaceRole } from "@/lib/workspace-context";

/** Increase (or set) purchased developer seats on an active Team subscription. */
export async function POST(req: NextRequest) {
  const ctx = await requireWorkspaceRole(rolesFor("settings_billing"));

  const body = (await req.json().catch(() => ({}))) as { quantity?: unknown };
  const quantity =
    typeof body.quantity === "number"
      ? body.quantity
      : typeof body.quantity === "string"
        ? Number(body.quantity)
        : NaN;

  if (!Number.isInteger(quantity) || quantity < 1) {
    return NextResponse.json({ error: "quantity must be a positive whole number" }, { status: 400 });
  }
  if (quantity > MAX_TEAM_SEATS) {
    return NextResponse.json({ error: `quantity cannot exceed ${MAX_TEAM_SEATS}` }, { status: 400 });
  }

  const developerCount = await prisma.developer.count({
    where: { orgId: ctx.orgId, removedAt: null },
  });
  const minSeats = Math.max(1, developerCount);
  if (quantity < minSeats) {
    return NextResponse.json(
      { error: `quantity must be at least ${minSeats} (current developers on the roster)`, minSeats },
      { status: 400 },
    );
  }

  try {
    await setSubscriptionQuantity(ctx.orgId, quantity);

    await audit({
      orgId: ctx.orgId,
      actorType: "user",
      actorId: ctx.userId,
      action: "billing.seats_updated",
      targetType: "organization",
      targetId: ctx.orgId,
      metadata: { quantity },
    });

    return NextResponse.json({ ok: true, quantity });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Seat update unavailable.";
    if (message.includes("must be at least") || message.includes("no subscription") || message.includes("not on a paid")) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return publicErrorResponse("billing/seats", error, "Seat update unavailable.", 500);
  }
}
