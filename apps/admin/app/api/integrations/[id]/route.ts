import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@usejunction/db";
import { z } from "zod";
import { validateConnection } from "@/lib/integrations/sync";
import { requireOrgRole, audit, rolesFor } from "@/lib/rbac";
import { credentialFingerprint, encryptSecret } from "@/lib/security";

const schema = z.object({ credential: z.string().min(8).max(20_000) });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireOrgRole(req, rolesFor("settings_billing"));
  if (auth instanceof NextResponse) return auth;
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "credential required" }, { status: 400 });
  const { id } = await params;
  const existing = await prisma.providerConnection.findFirst({ where: { id, orgId: auth.orgId } });
  if (!existing) return NextResponse.json({ error: "integration not found" }, { status: 404 });
  const updated = await prisma.providerConnection.update({
    where: { id },
    data: { credentialCiphertext: encryptSecret(parsed.data.credential), credentialFingerprint: credentialFingerprint(parsed.data.credential), credentialVersion: { increment: 1 }, status: "pending", nextSyncAt: new Date(), lastError: null },
  });
  try {
    await validateConnection(updated);
  } catch (error) {
    console.error("[integrations] credential validation failed", error);
    await prisma.providerConnection.update({
      where: { id },
      data: { status: "error", lastError: error instanceof Error ? error.message : String(error) },
    });
    return NextResponse.json({ error: "provider credential validation failed" }, { status: 422 });
  }
  await audit({ orgId: auth.orgId, actorType: "user", actorId: auth.userId, action: "integration.credential_rotated", targetType: "provider_connection", targetId: id });
  return NextResponse.json({ id, credentialFingerprint: updated.credentialFingerprint, status: "pending" });
}
