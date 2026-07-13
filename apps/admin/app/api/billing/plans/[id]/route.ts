import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@usejunction/db";
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
  const plan = await prisma.billingPlanTemplate.update({ where: { id }, data: parsed.data });
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
