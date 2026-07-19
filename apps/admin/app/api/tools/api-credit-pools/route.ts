import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@usejunction/db";
import { listApiCreditPools } from "@/lib/api-credits";
import { apiCreditPoolInputSchema } from "@/lib/api-credits/validation";
import { audit, requireOrgRole, rolesFor } from "@/lib/rbac";

export async function GET(req: NextRequest) {
  const auth = await requireOrgRole(req, rolesFor("settings_billing"));
  if (auth instanceof NextResponse) return auth;
  return NextResponse.json({ pools: await listApiCreditPools(auth.orgId) });
}

export async function POST(req: NextRequest) {
  const auth = await requireOrgRole(req, rolesFor("settings_billing"));
  if (auth instanceof NextResponse) return auth;
  const parsed = apiCreditPoolInputSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid API credit pool", details: parsed.error.flatten() }, { status: 400 });
  const input = parsed.data;
  const connection = await prisma.providerConnection.findFirst({ where: { id: input.connectionId, orgId: auth.orgId, provider: { in: ["openai", "anthropic"] }, product: "api_platform", status: { not: "disconnected" } } });
  if (!connection) return NextResponse.json({ error: "active OpenAI or Anthropic API connection required" }, { status: 422 });
  const existing = await prisma.apiCreditPool.findUnique({ where: { connectionId: connection.id } });
  if (existing) return NextResponse.json({ error: "this provider already has a credit pool" }, { status: 409 });
  const pool = await prisma.apiCreditPool.create({ data: {
    orgId: auth.orgId, connectionId: connection.id, provider: connection.provider, product: connection.product,
    name: input.name ?? `${connection.provider === "openai" ? "OpenAI" : "Anthropic"} API credits`, mode: input.mode,
    budgetMicros: input.budgetMicros, billingCadence: input.mode === "recurring" ? input.billingCadence : null,
    billingCycleAnchorDate: input.mode === "recurring" ? (input.billingCycleAnchorDate ?? new Date()) : null,
    billingCycleDays: input.mode === "recurring" && input.billingCadence === "custom" ? input.billingCycleDays : null,
    grantStartDate: input.mode === "fixed" ? input.grantStartDate : null, expiresAt: input.mode === "fixed" ? input.expiresAt : null,
    createdByUserId: auth.userId,
  } });
  await audit({ orgId: auth.orgId, actorType: "user", actorId: auth.userId, action: "api_credit_pool.created", targetType: "api_credit_pool", targetId: pool.id, metadata: { provider: pool.provider, mode: pool.mode, budgetMicros: pool.budgetMicros.toString() } });
  return NextResponse.json({ pool: (await listApiCreditPools(auth.orgId)).find((item) => item.id === pool.id) }, { status: 201 });
}
