import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@usejunction/db";
import { audit, requireOrgRole } from "@/lib/rbac";
import { serializeBigInts } from "@/lib/billing/validation";
import { deriveSubscription, listSubscriptions, subscriptionInputSchema } from "@/lib/tools/subscriptions";

function inputError(error: unknown) {
  const message = error instanceof Error ? error.message : "INVALID_SUBSCRIPTION";
  const labels: Record<string, string> = {
    CATALOG_PLAN_NOT_FOUND: "tool or plan was not found in the catalog",
    CADENCE_NOT_SUPPORTED: "this billing cadence is not available for the selected plan",
    CUSTOM_PRICE_REQUIRED: "enter a monthly seat price for this custom plan",
  };
  return NextResponse.json({ error: labels[message] ?? "invalid subscription" }, { status: 400 });
}

export async function GET(req: NextRequest) {
  const auth = await requireOrgRole(req, ["owner", "admin"]);
  if (auth instanceof NextResponse) return auth;
  try {
    return NextResponse.json(serializeBigInts({ subscriptions: await listSubscriptions(auth.orgId) }));
  } catch (error) {
    console.error("GET /api/tools/subscriptions", error);
    return NextResponse.json({ error: "could not load subscriptions" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireOrgRole(req, ["owner", "admin"]);
  if (auth instanceof NextResponse) return auth;
  const parsed = subscriptionInputSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid subscription", details: parsed.error.flatten() }, { status: 400 });
  let derived;
  try { derived = deriveSubscription(parsed.data); } catch (error) { return inputError(error); }
  const plan = await prisma.billingPlanTemplate.create({ data: { ...derived, orgId: auth.orgId, createdByUserId: auth.userId } });
  await audit({ orgId: auth.orgId, actorType: "user", actorId: auth.userId, action: "tools.subscription_created", targetType: "billing_plan_template", targetId: plan.id, metadata: { toolKey: plan.toolKey, planKey: plan.catalogPlanKey, seatCapacity: plan.seatCapacity } });
  return NextResponse.json(serializeBigInts({ subscription: { ...plan, assignedSeats: 0, availableSeats: plan.seatCapacity, estimatedMonthlyMicros: plan.monthlySeatMicros * BigInt(plan.seatCapacity) } }), { status: 201 });
}
