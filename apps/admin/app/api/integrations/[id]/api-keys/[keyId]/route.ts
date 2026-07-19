import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@usejunction/db";
import { z } from "zod";
import { audit, requireOrgRole, rolesFor } from "@/lib/rbac";

const schema = z.object({ developerId: z.string().trim().min(1).nullable() });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; keyId: string }> }) {
  const auth = await requireOrgRole(req, rolesFor("settings_billing"));
  if (auth instanceof NextResponse) return auth;
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid developer mapping" }, { status: 400 });
  const { id, keyId } = await params;
  const key = await prisma.providerApiKey.findFirst({ where: { id: keyId, connectionId: id, orgId: auth.orgId } });
  if (!key) return NextResponse.json({ error: "API key not found" }, { status: 404 });
  if (parsed.data.developerId) {
    const developer = await prisma.developer.findFirst({ where: { id: parsed.data.developerId, orgId: auth.orgId, removedAt: null }, select: { id: true } });
    if (!developer) return NextResponse.json({ error: "developer not found" }, { status: 422 });
  }
  // A manual clear is intentional too; retain it across owner-email auto-mapping
  // on later syncs instead of silently assigning the key again.
  const updated = await prisma.providerApiKey.update({ where: { id: key.id }, data: { developerId: parsed.data.developerId, mappingSource: "manual" } });
  await audit({ orgId: auth.orgId, actorType: "user", actorId: auth.userId, action: "provider_api_key.mapped", targetType: "provider_api_key", targetId: key.id, metadata: { developerId: parsed.data.developerId } });
  return NextResponse.json({ apiKey: { id: updated.id, developerId: updated.developerId, mappingSource: updated.mappingSource } });
}
