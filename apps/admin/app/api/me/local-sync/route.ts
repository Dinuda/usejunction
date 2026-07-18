import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@usejunction/db";
import { isDeviceOnline } from "@/lib/devices/presence";
import { requireOrgRole, rolesFor } from "@/lib/rbac";
import { decryptSecret } from "@/lib/security";

/**
 * Returns the current user's local agent sync endpoint + token so the browser
 * can bounce a sync to 127.0.0.1 when viewing the dashboard on that machine.
 */
export async function GET(req: NextRequest) {
  const auth = await requireOrgRole(req, rolesFor("self_view"));
  if (auth instanceof NextResponse) return auth;

  try {
    const developer = await prisma.developer.findFirst({
      where: { orgId: auth.orgId, authUserId: auth.userId },
      select: { id: true },
    });
    if (!developer) {
      return NextResponse.json({ error: "developer profile required" }, { status: 409 });
    }

    const device = await prisma.device.findFirst({
      where: {
        orgId: auth.orgId,
        userId: developer.id,
        localEndpoint: { not: null },
        localSyncTokenEnc: { not: null },
      },
      orderBy: { lastSeenAt: "desc" },
      select: {
        id: true,
        hostname: true,
        localEndpoint: true,
        localSyncTokenEnc: true,
        lastSeenAt: true,
        lastUsageSyncAt: true,
        lastAccountSyncAt: true,
        status: true,
      },
    });

    if (!device?.localEndpoint || !device.localSyncTokenEnc) {
      return NextResponse.json({
        available: false,
        reason: "no_local_endpoint",
        message: "Connect a machine and keep the agent daemon running to live-sync from this browser.",
      });
    }

    let token: string;
    try {
      token = decryptSecret(device.localSyncTokenEnc);
    } catch {
      return NextResponse.json({
        available: false,
        reason: "token_unavailable",
        message: "Local sync credentials need to be refreshed. Restart the agent daemon.",
      });
    }

    const online = isDeviceOnline(device.lastSeenAt);

    return NextResponse.json({
      available: true,
      deviceId: device.id,
      hostname: device.hostname,
      url: device.localEndpoint,
      token,
      online,
      lastSeenAt: device.lastSeenAt.toISOString(),
      lastUsageSyncAt: device.lastUsageSyncAt?.toISOString() ?? null,
      lastAccountSyncAt: device.lastAccountSyncAt?.toISOString() ?? null,
    });
  } catch (e) {
    console.error("[me/local-sync]", e);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
