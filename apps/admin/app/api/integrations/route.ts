import { NextRequest, NextResponse } from "next/server";
import { prisma, type Prisma } from "@usejunction/db";
import { z } from "zod";
import { getAdapter, supportedIntegrations } from "@/lib/integrations/adapters";
import type { IntegrationConfig } from "@/lib/integrations/types";
import { requireOrgRole, audit } from "@/lib/rbac";
import { credentialFingerprint, encryptSecret } from "@/lib/security";

const methods = ["oauth", "admin_api_key", "service_account", "otel", "gateway", "invoice_import", "admin_confirmed", "device_observed"] as const;
const observedProducts: Record<string, string> = { cursor: "teams", openai: "api_platform", anthropic: "api_platform" };
const schema = z.object({
  provider: z.enum(["github", "cursor", "openai", "anthropic"]),
  product: z.string().trim().min(1).max(64),
  method: z.enum(methods),
  credential: z.string().min(8).max(20_000).optional(),
  config: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).default({}),
});

export async function GET(req: NextRequest) {
  const auth = await requireOrgRole(req, ["owner", "admin"]);
  if (auth instanceof NextResponse) return auth;
  const connections = await prisma.providerConnection.findMany({
    where: { orgId: auth.orgId },
    select: { id: true, provider: true, product: true, method: true, status: true, externalOrgId: true, credentialFingerprint: true, permissions: true, config: true, lastSyncedAt: true, nextSyncAt: true, lastError: true, createdAt: true, updatedAt: true },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({
    connections,
    capabilities: [
      ...supportedIntegrations().map((item) => ({ ...item, status: "supported" })),
      { provider: "openai", product: "chatgpt_codex_workspace", status: "manual_import" },
      { provider: "okta", product: "enterprise_sso", status: "unsupported" },
    ],
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireOrgRole(req, ["owner", "admin"]);
  if (auth instanceof NextResponse) return auth;
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid integration configuration", details: parsed.error.flatten() }, { status: 400 });
  const { provider, product, method, credential, config } = parsed.data;
  const manual = method === "invoice_import" || method === "admin_confirmed";
  const observed = method === "device_observed";
  if (observed && observedProducts[provider] !== product) return NextResponse.json({ error: "unsupported automatic connection" }, { status: 422 });
  if (!manual && !observed && !credential) return NextResponse.json({ error: "credential required" }, { status: 400 });
  let adapter;
  let validation: { externalOrgId?: string; permissions?: string[] } = {};
  if (observed) {
    validation = { permissions: ["device_presence:read", "device_activity:read"] };
  } else if (!manual) {
    try {
      adapter = getAdapter(provider, product);
    } catch (error) {
      return NextResponse.json({ error: String(error) }, { status: 422 });
    }
    try {
      validation = await adapter.validate({ credential: credential!, config: { ...config, product } as IntegrationConfig, initialSync: true, now: new Date() });
    } catch (error) {
      return NextResponse.json({ error: "provider credential validation failed", detail: error instanceof Error ? error.message : String(error) }, { status: 422 });
    }
  }
  const connection = await prisma.providerConnection.upsert({
    where: { orgId_provider_product: { orgId: auth.orgId, provider, product } },
    update: {
      method,
      status: manual ? "manual" : observed ? "active" : "pending",
      externalOrgId: validation.externalOrgId ?? null,
      credentialCiphertext: credential ? encryptSecret(credential) : null,
      credentialFingerprint: credential ? credentialFingerprint(credential) : null,
      config: { ...config, product } as Prisma.InputJsonValue,
      permissions: (validation.permissions ?? []) as Prisma.InputJsonValue,
      nextSyncAt: manual || observed ? null : new Date(),
      lastError: null,
    },
    create: {
      orgId: auth.orgId,
      provider,
      product,
      method,
      status: manual ? "manual" : observed ? "active" : "pending",
      externalOrgId: validation.externalOrgId ?? null,
      credentialCiphertext: credential ? encryptSecret(credential) : null,
      credentialFingerprint: credential ? credentialFingerprint(credential) : null,
      config: { ...config, product } as Prisma.InputJsonValue,
      permissions: (validation.permissions ?? []) as Prisma.InputJsonValue,
      nextSyncAt: manual || observed ? null : new Date(),
      createdByUserId: auth.userId,
    },
    select: { id: true, provider: true, product: true, method: true, status: true, externalOrgId: true, credentialFingerprint: true, permissions: true, nextSyncAt: true },
  });
  await audit({ orgId: auth.orgId, actorType: "user", actorId: auth.userId, action: "integration.connected", targetType: "provider_connection", targetId: connection.id, metadata: { provider, product, method } });
  return NextResponse.json({ connection }, { status: 201 });
}
