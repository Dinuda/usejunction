import { NextRequest, NextResponse } from "next/server";
import { prisma, Prisma } from "@usejunction/db";
import { audit, requireOrgRole } from "@/lib/rbac";
import { serializeBigInts } from "@/lib/billing/validation";
import { catalogPrice, findCatalogPlan, type BillingCadence } from "@/lib/tools/catalog";
import { subscriptionUpdateSchema } from "@/lib/tools/subscriptions";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireOrgRole(req, ["owner", "admin"]);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const parsed = subscriptionUpdateSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid subscription", details: parsed.error.flatten() }, { status: 400 });
  const existing = await prisma.billingPlanTemplate.findFirst({ where: { id, orgId: auth.orgId } });
  if (!existing) return NextResponse.json({ error: "subscription not found" }, { status: 404 });
  const data = { ...parsed.data };
  if (data.billingCadence && existing.toolKey && existing.catalogPlanKey) {
    const plan = findCatalogPlan(existing.toolKey, existing.catalogPlanKey);
    const catalogMicros = plan && catalogPrice(plan, data.billingCadence as BillingCadence);
    if (!existing.customPrice && catalogMicros === undefined) return NextResponse.json({ error: "billing cadence is not available for this plan" }, { status: 400 });
    if (!existing.customPrice && catalogMicros !== undefined) data.monthlySeatMicros = catalogMicros;
  }
  let result;
  try {
    result = await prisma.$transaction(async (tx) => {
      const aggregate = await tx.developerPlanAssignment.aggregate({ where: { orgId: auth.orgId, planTemplateId: id, active: true, seatStatus: "active" }, _sum: { seatCount: true } });
      const assignedSeats = aggregate._sum.seatCount ?? 0;
      if (data.seatCapacity !== undefined && data.seatCapacity < assignedSeats) throw new Error(`SEAT_CAPACITY:${assignedSeats}`);
      const subscription = await tx.billingPlanTemplate.update({ where: { id }, data });
      return { subscription, assignedSeats };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("SEAT_CAPACITY:")) {
      const assignedSeats = Number(error.message.split(":")[1]);
      return NextResponse.json({ error: `seat quantity cannot be lower than ${assignedSeats} assigned seats` }, { status: 409 });
    }
    throw error;
  }
  const { subscription, assignedSeats } = result;
  await audit({ orgId: auth.orgId, actorType: "user", actorId: auth.userId, action: "tools.subscription_updated", targetType: "billing_plan_template", targetId: id });
  return NextResponse.json(serializeBigInts({ subscription, assignedSeats, availableSeats: Math.max(0, subscription.seatCapacity - assignedSeats), estimatedMonthlyMicros: subscription.monthlySeatMicros * BigInt(subscription.seatCapacity) }));
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireOrgRole(req, ["owner", "admin"]);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const result = await prisma.billingPlanTemplate.updateMany({ where: { id, orgId: auth.orgId, active: true }, data: { active: false } });
  if (!result.count) return NextResponse.json({ error: "subscription not found" }, { status: 404 });
  await audit({ orgId: auth.orgId, actorType: "user", actorId: auth.userId, action: "tools.subscription_archived", targetType: "billing_plan_template", targetId: id });
  return NextResponse.json({ ok: true });
}
