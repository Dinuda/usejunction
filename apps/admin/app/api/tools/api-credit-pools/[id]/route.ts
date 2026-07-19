import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@usejunction/db";
import { listApiCreditPools } from "@/lib/api-credits";
import { apiCreditPoolUpdateSchema } from "@/lib/api-credits/validation";
import { audit, requireOrgRole, rolesFor } from "@/lib/rbac";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireOrgRole(req, rolesFor("settings_billing"));
  if (auth instanceof NextResponse) return auth;
  const parsed = apiCreditPoolUpdateSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid API credit pool", details: parsed.error.flatten() }, { status: 400 });
  const { id } = await params;
  const existing = await prisma.apiCreditPool.findFirst({ where: { id, orgId: auth.orgId } });
  if (!existing) return NextResponse.json({ error: "credit pool not found" }, { status: 404 });
  if (parsed.data.budgetMicros != null && parsed.data.budgetMicros <= BigInt(0)) return NextResponse.json({ error: "budget must be positive" }, { status: 400 });
  if ((parsed.data.billingCadence ?? existing.billingCadence) === "custom" && !(parsed.data.billingCycleDays ?? existing.billingCycleDays)) return NextResponse.json({ error: "custom cadence requires days" }, { status: 400 });
  if (parsed.data.expiresAt && (parsed.data.grantStartDate ?? existing.grantStartDate) && parsed.data.expiresAt <= (parsed.data.grantStartDate ?? existing.grantStartDate)!) return NextResponse.json({ error: "expiry must be after grant start" }, { status: 400 });
  await prisma.apiCreditPool.update({ where: { id }, data: parsed.data });
  await audit({ orgId: auth.orgId, actorType: "user", actorId: auth.userId, action: "api_credit_pool.updated", targetType: "api_credit_pool", targetId: id, metadata: { fields: Object.keys(parsed.data) } });
  return NextResponse.json({ pool: (await listApiCreditPools(auth.orgId, new Date(), true)).find((item) => item.id === id) });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireOrgRole(req, rolesFor("settings_billing"));
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const result = await prisma.apiCreditPool.updateMany({ where: { id, orgId: auth.orgId, active: true }, data: { active: false } });
  if (!result.count) return NextResponse.json({ error: "credit pool not found" }, { status: 404 });
  await audit({ orgId: auth.orgId, actorType: "user", actorId: auth.userId, action: "api_credit_pool.archived", targetType: "api_credit_pool", targetId: id });
  return NextResponse.json({ archived: true });
}
