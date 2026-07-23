import { NextRequest, NextResponse } from "next/server";
import { findDeviceByBearerToken } from "@/lib/auth";
import { limitedJson } from "@/lib/security/http";
import { logServerError } from "@/lib/errors/public";
import {
  applyDeviceToolInventory,
  toolsInventoryContentHash,
  type ToolInventoryItem,
} from "@/lib/sync/tools-inventory";

/**
 * Compatibility endpoint for agents that still POST tool inventory here.
 * Canonical path is the sync-start tools sidecar; both call applyDeviceToolInventory.
 */
export async function POST(req: NextRequest) {
  try {
    const device = await findDeviceByBearerToken(req, {
      select: {
        id: true,
        orgId: true,
        userId: true,
        toolsContentHash: true,
      },
    });
    if (!device) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const parsedBody = await limitedJson(req, 128 * 1024);
    if (!parsedBody.ok) return parsedBody.response;
    const body = parsedBody.data as Record<string, unknown>;
    const tools = body.tools;
    if (!Array.isArray(tools)) {
      return NextResponse.json({ error: "tools array required" }, { status: 400 });
    }

    const items: ToolInventoryItem[] = tools.map((tool) => {
      const row = tool as Record<string, unknown>;
      return {
        toolName: String(row.toolName ?? ""),
        detected: row.detected !== false,
        configured: Boolean(row.configured),
        configPath: typeof row.configPath === "string" ? row.configPath : null,
        version: typeof row.version === "string" ? row.version : null,
      };
    });
    const contentHash = toolsInventoryContentHash(items);

    if (device.toolsContentHash && device.toolsContentHash === contentHash) {
      return NextResponse.json({ upserted: 0, unchanged: true });
    }

    const result = await applyDeviceToolInventory({
      orgId: device.orgId,
      userId: device.userId,
      deviceId: device.id,
      items,
      contentHash,
    });

    return NextResponse.json({ upserted: result.upserted });
  } catch (e) {
    logServerError("devices/tools", e);
    return NextResponse.json({ error: "tools upsert failed" }, { status: 500 });
  }
}
