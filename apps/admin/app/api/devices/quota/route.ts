import { NextRequest, NextResponse } from "next/server";
import { findDeviceByBearerToken } from "@/lib/auth";
import { limitedJson } from "@/lib/security/http";
import { logServerError } from "@/lib/errors/public";
import {
  applyDeviceQuotaInventory,
  quotasInventoryContentHash,
  type QuotaInventoryItem,
} from "@/lib/sync/quotas-inventory";

/**
 * Compatibility endpoint for agents that still POST quotas here.
 * Canonical path is the sync-start quotas sidecar.
 */
export async function POST(req: NextRequest) {
  try {
    const device = await findDeviceByBearerToken(req, {
      select: {
        id: true,
        orgId: true,
        userId: true,
        quotasContentHash: true,
      },
    });
    if (!device) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const parsedBody = await limitedJson(req, 128 * 1024);
    if (!parsedBody.ok) return parsedBody.response;
    const body = parsedBody.data as Record<string, unknown>;
    const rows = Array.isArray(body.quotas)
      ? body.quotas
      : Array.isArray(body.snapshots)
        ? body.snapshots
        : [body];

    const items: QuotaInventoryItem[] = rows.map((snap) => {
      const row = snap as Record<string, unknown>;
      return {
        toolName: String(row.toolName ?? ""),
        windowType: String(row.windowType ?? ""),
        usedPercent: typeof row.usedPercent === "number" ? row.usedPercent : null,
        resetAt: typeof row.resetAt === "string" ? row.resetAt : null,
        creditsRemaining: typeof row.creditsRemaining === "number" ? row.creditsRemaining : null,
        source: typeof row.source === "string" ? row.source : null,
      };
    });
    const contentHash = quotasInventoryContentHash(items);

    if (device.quotasContentHash && device.quotasContentHash === contentHash) {
      return NextResponse.json({ upserted: 0, unchanged: true });
    }

    const result = await applyDeviceQuotaInventory({
      orgId: device.orgId,
      userId: device.userId,
      deviceId: device.id,
      items,
      contentHash,
    });

    return NextResponse.json({ upserted: result.upserted });
  } catch (e) {
    logServerError("devices/quota", e);
    return NextResponse.json({ error: "quota upsert failed" }, { status: 500 });
  }
}
