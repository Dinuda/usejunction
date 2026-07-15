import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma, type Prisma } from "@usejunction/db";
import { z } from "zod";
import { normalizeEmail } from "@/lib/developer-identity";
import { requireOrgRole, audit } from "@/lib/rbac";
import { invalidateAnalyticsCache } from "@/lib/analytics/query";

const rowSchema = z.object({
  date: z.coerce.date(),
  email: z.string().email().optional(),
  toolName: z.string().trim().max(64).default(""),
  model: z.string().trim().max(128).default(""),
  requests: z.coerce.number().int().nonnegative().default(0),
  sessions: z.coerce.number().int().nonnegative().default(0),
  inputTokens: z.coerce.number().int().nonnegative().default(0),
  outputTokens: z.coerce.number().int().nonnegative().default(0),
  costUsd: z.coerce.number().nonnegative().default(0),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
const schema = z.object({ rows: z.array(rowSchema).min(1).max(10_000) });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireOrgRole(req, ["owner", "admin"]);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const connection = await prisma.providerConnection.findFirst({ where: { id, orgId: auth.orgId, method: "invoice_import" } });
  if (!connection) return NextResponse.json({ error: "invoice-import connection not found" }, { status: 404 });
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid import rows", details: parsed.error.flatten() }, { status: 400 });
  for (const [index, row] of parsed.data.rows.entries()) {
    const email = row.email ? normalizeEmail(row.email) : null;
    const developer = email ? await prisma.developer.findUnique({ where: { orgId_email: { orgId: auth.orgId, email } }, select: { id: true } }) : null;
    const normalizedDate = new Date(Date.UTC(row.date.getUTCFullYear(), row.date.getUTCMonth(), row.date.getUTCDate()));
    const fingerprint = createHash("sha256").update(JSON.stringify({ connection: id, index, ...row, date: normalizedDate.toISOString() })).digest("hex");
    await prisma.usageDaily.upsert({
      where: { orgId_dedupeKey: { orgId: auth.orgId, dedupeKey: `import:${fingerprint}` } },
      update: { developerId: developer?.id ?? null, requests: row.requests, sessions: row.sessions, inputTokens: BigInt(row.inputTokens), outputTokens: BigInt(row.outputTokens), costMicros: BigInt(Math.round(row.costUsd * 1_000_000)), observedAt: new Date(), metadata: row.metadata as Prisma.InputJsonValue | undefined },
      create: { orgId: auth.orgId, developerId: developer?.id ?? null, connectionId: id, date: normalizedDate, provider: connection.provider, product: connection.product, toolName: row.toolName, model: row.model, source: "invoice_imported", sourceRef: fingerprint, verified: true, requests: row.requests, sessions: row.sessions, inputTokens: BigInt(row.inputTokens), outputTokens: BigInt(row.outputTokens), costMicros: BigInt(Math.round(row.costUsd * 1_000_000)), dedupeKey: `import:${fingerprint}`, metadata: row.metadata as Prisma.InputJsonValue | undefined },
    });
  }
  await prisma.providerConnection.update({ where: { id }, data: { status: "active", lastSyncedAt: new Date(), lastError: null } });
  await invalidateAnalyticsCache(auth.orgId);
  await audit({ orgId: auth.orgId, actorType: "user", actorId: auth.userId, action: "integration.invoice_imported", targetType: "provider_connection", targetId: id, metadata: { rows: parsed.data.rows.length } });
  return NextResponse.json({ imported: parsed.data.rows.length });
}
