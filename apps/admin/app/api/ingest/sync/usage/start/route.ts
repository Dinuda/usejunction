import { NextRequest, NextResponse } from "next/server";
import { findDeviceByBearerToken, requireIngestAuth } from "@/lib/auth";
import { limitedJson } from "@/lib/security/http";
import { logServerError } from "@/lib/errors/public";
import { startUsageSync, type ManifestPartition } from "@/lib/sync/usage-sync";
import { prisma } from "@usejunction/db";

export const maxDuration = 30;

function parseSidecar(raw: unknown): { contentHash?: string; items?: Array<Record<string, unknown>> } | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const t = raw as Record<string, unknown>;
  return {
    contentHash: typeof t.contentHash === "string" ? t.contentHash : undefined,
    items: Array.isArray(t.items) ? (t.items as Array<Record<string, unknown>>) : undefined,
  };
}

export async function POST(req: NextRequest) {
  try {
    const parsedBody = await limitedJson(req, 2 * 1024 * 1024);
    if (!parsedBody.ok) return parsedBody.response;
    const body = parsedBody.data as Record<string, unknown>;

    let orgId: string | null = null;
    let userId: string | null = null;
    let deviceId: string | null = null;

    const device = await findDeviceByBearerToken(req, {});
    if (device) {
      orgId = device.orgId;
      userId = device.userId;
      deviceId = device.id;
    }
    if (!deviceId) {
      const authResult = requireIngestAuth(req);
      if (authResult instanceof NextResponse) return authResult;
      orgId = typeof body.orgId === "string" ? body.orgId : null;
      userId = typeof body.userId === "string" ? body.userId : null;
      deviceId = typeof body.deviceId === "string" ? body.deviceId : null;
    }
    if (!orgId || !userId || !deviceId) {
      return NextResponse.json({ error: "device context required" }, { status: 400 });
    }

    const contextDevice = await prisma.device.findFirst({ where: { id: deviceId, orgId, userId } });
    if (!contextDevice) return NextResponse.json({ error: "invalid device context" }, { status: 403 });

    const partitions = Array.isArray(body.partitions) ? (body.partitions as ManifestPartition[]) : [];
    const tools = parseSidecar(body.tools);
    const accounts = parseSidecar(body.accounts);
    const quotas = parseSidecar(body.quotas);

    const result = await startUsageSync({
      orgId,
      userId,
      deviceId,
      partitions,
      tools: tools
        ? {
            contentHash: tools.contentHash,
            items: (tools.items ?? []).map((item) => ({
              toolName: String(item.toolName ?? ""),
              detected: item.detected !== false,
              configured: Boolean(item.configured),
              configPath: typeof item.configPath === "string" ? item.configPath : null,
              version: typeof item.version === "string" ? item.version : null,
            })),
          }
        : undefined,
      accounts: accounts
        ? {
            contentHash: accounts.contentHash,
            items: (accounts.items ?? []).map((item) => ({
              toolName: String(item.toolName ?? ""),
              email: typeof item.email === "string" ? item.email : null,
              plan: typeof item.plan === "string" ? item.plan : null,
              loginMethod: typeof item.loginMethod === "string" ? item.loginMethod : "unknown",
              authPresent: Boolean(item.authPresent),
            })),
          }
        : undefined,
      quotas: quotas
        ? {
            contentHash: quotas.contentHash,
            items: (quotas.items ?? []).map((item) => ({
              toolName: String(item.toolName ?? ""),
              windowType: String(item.windowType ?? ""),
              usedPercent: typeof item.usedPercent === "number" ? item.usedPercent : null,
              resetAt: typeof item.resetAt === "string" ? item.resetAt : null,
              creditsRemaining: typeof item.creditsRemaining === "number" ? item.creditsRemaining : null,
              source: typeof item.source === "string" ? item.source : null,
            })),
          }
        : undefined,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    logServerError("sync/usage/start", error);
    return NextResponse.json({ error: "sync start failed" }, { status: 500 });
  }
}
