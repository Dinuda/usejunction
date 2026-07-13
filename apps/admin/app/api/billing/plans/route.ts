import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@usejunction/db";
import { planTemplateSchema, serializeBigInts } from "@/lib/billing/validation";
import { requireOrgRole, audit } from "@/lib/rbac";

export async function GET(req: NextRequest) {
  const auth = await requireOrgRole(req, ["owner", "admin"]);
  if (auth instanceof NextResponse) return auth;
  const plans = await prisma.billingPlanTemplate.findMany({
    where: { orgId: auth.orgId },
    include: { _count: { select: { assignments: true } } },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });
  return NextResponse.json(serializeBigInts({ plans }));
}

export async function POST(req: NextRequest) {
  const auth = await requireOrgRole(req, ["owner", "admin"]);
  if (auth instanceof NextResponse) return auth;
  const parsed = planTemplateSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid plan template", details: parsed.error.flatten() }, { status: 400 });
  const plan = await prisma.billingPlanTemplate.create({ data: { ...parsed.data, orgId: auth.orgId, createdByUserId: auth.userId } });
  await audit({ orgId: auth.orgId, actorType: "user", actorId: auth.userId, action: "billing.plan_created", targetType: "billing_plan_template", targetId: plan.id, metadata: { provider: plan.provider, product: plan.product, toolName: plan.toolName } });
  return NextResponse.json(serializeBigInts({ plan }), { status: 201 });
}
