import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@usejunction/db";
import {
  recordDeviceActivityEvent,
} from "@/lib/activity/record-device-activity-event";
import { findDeviceByBearerToken } from "@/lib/auth";
import { updateDirectiveForHeartbeat } from "@/lib/agent-updates";
import { revokeDeviceAuth } from "@/lib/devices/decommission";
import { encryptSecret, hashOpaqueToken } from "@/lib/security";
import { limitedJson } from "@/lib/security/http";
import { logServerError } from "@/lib/errors/public";

export async function POST(req: NextRequest) {
  const started = Date.now();
  try {
    const device = await findDeviceByBearerToken(req, {
      include: { user: { select: { removedAt: true } } },
    });
    if (!device) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const shouldUninstall = Boolean(device.decommissionedAt || device.user.removedAt);
    if (shouldUninstall) {
      await prisma.$transaction(async (tx) => {
        if (!device.decommissionedAt) {
          await tx.device.update({
            where: { id: device.id },
            data: {
              decommissionedAt: device.user.removedAt ?? new Date(),
              localEndpoint: null,
              localSyncTokenHash: null,
              localSyncTokenEnc: null,
            },
          });
        }
        await revokeDeviceAuth(tx, device.id);
      });
      await recordDeviceActivityEvent({
        orgId: device.orgId,
        developerId: device.userId,
        deviceId: device.id,
        kind: "heartbeat",
        direction: "directive",
        status: "ok",
        summary: `Heartbeat · uninstall directive · ${device.hostname}`,
        requestSummary: { hostname: device.hostname },
        responseSummary: { uninstall: true },
        durationMs: Date.now() - started,
      });
      return NextResponse.json({ ok: true, deviceId: device.id, uninstall: true });
    }

    const parsedBody = await limitedJson(req, 128 * 1024);
    if (!parsedBody.ok) return parsedBody.response;
    const body = parsedBody.data as Record<string, unknown>;
    const localEndpoint =
      typeof body.localEndpoint === "string" && body.localEndpoint.startsWith("http://127.0.0.1")
        ? body.localEndpoint.slice(0, 128)
        : undefined;
    const localSyncToken =
      typeof body.localSyncToken === "string" && body.localSyncToken.length >= 16
        ? body.localSyncToken.slice(0, 256)
        : undefined;

    await prisma.$transaction(async (tx) => {
      // Only one agent can own a loopback sync port — drop stale claims so the
      // dashboard never bounces with a token that the running daemon rejects.
      if (localEndpoint) {
        await tx.device.updateMany({
          where: {
            localEndpoint,
            id: { not: device.id },
          },
          data: {
            localEndpoint: null,
            localSyncTokenHash: null,
            localSyncTokenEnc: null,
          },
        });
      }

      await tx.device.update({
        where: { id: device.id },
        data: {
          lastSeenAt: new Date(),
          ...(body.agentVersion ? { agentVersion: String(body.agentVersion).slice(0, 64) } : {}),
          ...(body.os ? { os: String(body.os).slice(0, 64) } : {}),
          ...(body.architecture ? { architecture: String(body.architecture).slice(0, 64) } : {}),
          ...(body.hostname ? { hostname: String(body.hostname).slice(0, 255) } : {}),
          ...(localEndpoint ? { localEndpoint } : {}),
          ...(localSyncToken
            ? {
                localSyncTokenHash: hashOpaqueToken(localSyncToken),
                localSyncTokenEnc: encryptSecret(localSyncToken),
              }
            : {}),
        },
      });
    });

    let update = null;
    try {
      update = await updateDirectiveForHeartbeat({
        id: device.id,
        orgId: device.orgId,
        os: typeof body.os === "string" ? body.os : device.os,
        architecture: typeof body.architecture === "string" ? body.architecture : device.architecture,
        agentVersion: typeof body.agentVersion === "string" ? body.agentVersion : device.agentVersion,
      });
    } catch (error) {
      logServerError("devices/heartbeat-update", error);
    }

    const hostname =
      typeof body.hostname === "string" ? body.hostname.slice(0, 255) : device.hostname;
    const agentVersion =
      typeof body.agentVersion === "string" ? body.agentVersion.slice(0, 64) : device.agentVersion;
    const hasUpdate = Boolean(update);

    await recordDeviceActivityEvent({
      orgId: device.orgId,
      developerId: device.userId,
      deviceId: device.id,
      kind: "heartbeat",
      direction: hasUpdate ? "directive" : "ingest",
      status: "ok",
      summary: hasUpdate
        ? `Heartbeat · update directive · ${hostname} · agent ${agentVersion}`
        : `Heartbeat · ${hostname} · agent ${agentVersion}`,
      requestSummary: {
        hostname,
        os: typeof body.os === "string" ? body.os.slice(0, 64) : device.os,
        architecture:
          typeof body.architecture === "string" ? body.architecture.slice(0, 64) : device.architecture,
        agentVersion,
        localEndpointPresent: Boolean(localEndpoint),
        localSyncTokenPresent: Boolean(localSyncToken),
      },
      responseSummary: {
        ok: true,
        deviceId: device.id,
        updatePresent: hasUpdate,
        ...(hasUpdate && update && typeof update === "object"
          ? {
              update: {
                version:
                  "version" in update && typeof update.version === "string" ? update.version : null,
                urgency:
                  "urgency" in update && typeof update.urgency === "string" ? update.urgency : null,
              },
            }
          : {}),
      },
      durationMs: Date.now() - started,
    });

    return NextResponse.json({ ok: true, deviceId: device.id, update });
  } catch (e) {
    logServerError("devices/heartbeat", e);
    return NextResponse.json({ error: "heartbeat failed" }, { status: 500 });
  }
}
