import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@usejunction/db";
import { requireOrgRole, audit, rolesFor } from "@/lib/rbac";
import { generateOpaqueToken, hashOpaqueToken } from "@/lib/security";

function settings(token: string) {
  const endpoint = `${process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001"}/api/otel/v1/metrics`;
  return {
    env: {
      CLAUDE_CODE_ENABLE_TELEMETRY: "1",
      OTEL_METRICS_EXPORTER: "otlp",
      OTEL_LOGS_EXPORTER: "none",
      OTEL_TRACES_EXPORTER: "none",
      OTEL_EXPORTER_OTLP_METRICS_PROTOCOL: "http/json",
      OTEL_EXPORTER_OTLP_METRICS_ENDPOINT: endpoint,
      OTEL_EXPORTER_OTLP_METRICS_HEADERS: `Authorization=Bearer ${token}`,
      OTEL_LOG_USER_PROMPTS: "0",
      OTEL_LOG_TOOL_DETAILS: "0",
      OTEL_LOG_TOOL_CONTENT: "0",
    },
  };
}

export async function GET(req: NextRequest) {
  const auth = await requireOrgRole(req, rolesFor("settings_billing"));
  if (auth instanceof NextResponse) return auth;
  const endpoint = await prisma.telemetryEndpoint.findUnique({ where: { orgId: auth.orgId }, select: { id: true, tokenHint: true, enabled: true, createdAt: true, rotatedAt: true } });
  return NextResponse.json({ endpoint });
}

export async function POST(req: NextRequest) {
  const auth = await requireOrgRole(req, rolesFor("settings_billing"));
  if (auth instanceof NextResponse) return auth;
  const token = generateOpaqueToken("uj_otel", 32);
  const now = new Date();
  const endpoint = await prisma.telemetryEndpoint.upsert({
    where: { orgId: auth.orgId },
    update: { tokenHash: hashOpaqueToken(token), tokenHint: token.slice(-6), enabled: true, rotatedAt: now },
    create: { orgId: auth.orgId, tokenHash: hashOpaqueToken(token), tokenHint: token.slice(-6), enabled: true, rotatedAt: now },
    select: { id: true, tokenHint: true, enabled: true, rotatedAt: true },
  });
  await audit({ orgId: auth.orgId, actorType: "user", actorId: auth.userId, action: "telemetry_token.rotated", targetType: "telemetry_endpoint", targetId: endpoint.id });
  return NextResponse.json({ endpoint, token, managedSettings: settings(token) }, { status: 201 });
}
