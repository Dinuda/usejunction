import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@usejunction/db";
import { z } from "zod";
import { getAdapter } from "@/lib/integrations/adapters";
import type { IntegrationConfig } from "@/lib/integrations/types";
import { requireOrgRole, audit, rolesFor } from "@/lib/rbac";
import { credentialFingerprint, encryptSecret } from "@/lib/security";
import { logServerError } from "@/lib/errors/public";

const schema = z.object({ credential: z.string().min(8).max(20_000) });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireOrgRole(req, rolesFor("settings_billing"));
  if (auth instanceof NextResponse) return auth;
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "credential required" }, { status: 400 });
  const { id } = await params;
  const existing = await prisma.providerConnection.findFirst({ where: { id, orgId: auth.orgId } });
  if (!existing) return NextResponse.json({ error: "integration not found" }, { status: 404 });
  try {
    await getAdapter(existing.provider, existing.product).validate({
      credential: parsed.data.credential,
      config: (existing.config ?? {}) as IntegrationConfig,
      initialSync: !existing.lastSyncedAt,
      now: new Date(),
    });
  } catch (error) {
    logServerError("integrations", error, { phase: "credential validation" });
    return NextResponse.json({ error: "provider credential validation failed" }, { status: 422 });
  }
  const updated = await prisma.providerConnection.update({
    where: { id },
    data: { credentialCiphertext: encryptSecret(parsed.data.credential), credentialFingerprint: credentialFingerprint(parsed.data.credential), credentialVersion: { increment: 1 }, status: "pending", nextSyncAt: new Date(), lastError: null },
  });
  await audit({ orgId: auth.orgId, actorType: "user", actorId: auth.userId, action: "integration.credential_rotated", targetType: "provider_connection", targetId: id });
  return NextResponse.json({ id, credentialFingerprint: updated.credentialFingerprint, status: "pending" });
}
