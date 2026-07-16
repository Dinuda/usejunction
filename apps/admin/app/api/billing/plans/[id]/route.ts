import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@usejunction/db";
import { cycleFromNextRenewal } from "@/lib/billing/cycles";
import { planTemplateSchema, serializeBigInts } from "@/lib/billing/validation";
import { requireOrgRole, audit } from "@/lib/rbac";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireOrgRole(req, ["owner", "admin"]);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const plan = await prisma.billingPlanTemplate.findFirst({ where: { id, orgId: auth.orgId }, include: { _count: { select: { assignments: true } } } });
  if (!plan) return NextResponse.json({ error: "plan template not found" }, { status: 404 });
  return NextResponse.json(serializeBigInts({ plan }));
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireOrgRole(req, ["owner", "admin"]);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const parsed = planTemplateSchema.partial().safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid plan template", details: parsed.error.flatten() }, { status: 400 });
  const existing = await prisma.billingPlanTemplate.findFirst({ where: { id, orgId: auth.orgId } });
  if (!existing) return NextResponse.json({ error: "plan template not found" }, { status: 404 });
  const { nextRenewalDate, ...data } = parsed.data;
  const cadence = data.billingCadence ?? existing.billingCadence;
  const cycleDays = data.billingCycleDays ?? existing.billingCycleDays;
  if (cadence === "custom" && !cycleDays) {
    return NextResponse.json({ error: "custom billing cycles require a day count" }, { status: 400 });
  }
  if (nextRenewalDate) {
    const anchor = cycleFromNextRenewal({
      nextRenewalDate,
      billingCadence: cadence,
      billingCycleDays: cycleDays,
    });
    if (
      data.billingCycleAnchorDate &&
      data.billingCycleAnchorDate.toISOString().slice(0, 10) !== anchor.toISOString().slice(0, 10)
    ) {
      return NextResponse.json({ error: "cycle start and next renewal do not describe the same billing cycle" }, { status: 400 });
    }
    data.billingCycleAnchorDate = anchor;
  }
  if (data.billingCadence && data.billingCadence !== "custom") data.billingCycleDays = null;
  const plan = await prisma.billingPlanTemplate.update({ where: { id }, data });
  await audit({ orgId: auth.orgId, actorType: "user", actorId: auth.userId, action: "billing.plan_updated", targetType: "billing_plan_template", targetId: id });
  return NextResponse.json(serializeBigInts({ plan }));
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireOrgRole(req, ["owner", "admin"]);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const result = await prisma.billingPlanTemplate.updateMany({ where: { id, orgId: auth.orgId }, data: { active: false } });
  if (!result.count) return NextResponse.json({ error: "plan template not found" }, { status: 404 });
  await audit({ orgId: auth.orgId, actorType: "user", actorId: auth.userId, action: "billing.plan_archived", targetType: "billing_plan_template", targetId: id });
  return NextResponse.json({ ok: true });
}
