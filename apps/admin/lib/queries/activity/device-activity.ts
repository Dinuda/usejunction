import { prisma } from "@usejunction/db";
import type {
  DeviceActivityDeveloper,
  DeviceActivityDevice,
  DeviceActivityFeed,
  DeviceActivityItem,
} from "@/lib/queries/activity/device-activity-types";

export type {
  DeviceActivityDeveloper,
  DeviceActivityDevice,
  DeviceActivityFeed,
  DeviceActivityInspect,
  DeviceActivityItem,
} from "@/lib/queries/activity/device-activity-types";

function deviceSnapshot(
  device: {
    id: string;
    hostname: string;
    os: string;
    architecture: string;
    agentVersion: string;
    lastSeenAt: Date;
  },
): DeviceActivityDevice {
  return {
    id: device.id,
    hostname: device.hostname,
    os: device.os,
    architecture: device.architecture,
    agentVersion: device.agentVersion,
  };
}

function developerSnapshot(user: { id: string; name: string; email: string } | null): DeviceActivityDeveloper {
  if (!user) return null;
  return { id: user.id, name: user.name, email: user.email };
}

function kindTitle(kind: string): string {
  switch (kind) {
    case "heartbeat":
      return "Heartbeat";
    case "tools":
      return "Tools sync";
    case "accounts":
      return "Account sync";
    case "quota":
      return "Quota sync";
    case "local_models":
      return "Local models sync";
    case "usage":
      return "Usage sync";
    case "work_sessions":
      return "Work sessions";
    case "signals_sessions":
      return "Signals sessions";
    case "gateway_request":
      return "Gateway request";
    case "work_session":
      return "Work session";
    case "signals_session":
      return "Signals journey";
    case "agent_update":
      return "Agent update";
    default:
      return kind.replaceAll("_", " ");
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

export async function getDeviceActivityFeed(
  orgId: string,
  options: { developerId?: string; limit?: number; now?: Date } = {},
): Promise<DeviceActivityFeed> {
  const limit = Math.min(options.limit ?? 50, 100);
  const developerWhere = options.developerId ? { developerId: options.developerId } : {};
  const deviceDeveloperWhere = options.developerId ? { userId: options.developerId } : {};

  const [events, devices] = await Promise.all([
    prisma.deviceActivityEvent.findMany({
      where: { orgId, ...developerWhere },
      orderBy: { occurredAt: "desc" },
      take: limit,
      include: {
        device: {
          select: {
            id: true,
            hostname: true,
            os: true,
            architecture: true,
            agentVersion: true,
            lastSeenAt: true,
          },
        },
        developer: { select: { id: true, name: true, email: true } },
      },
    }),
    prisma.device.findMany({
      where: { orgId, decommissionedAt: null, ...deviceDeveloperWhere },
      orderBy: { lastSeenAt: "desc" },
      take: 20,
      include: { user: { select: { id: true, name: true, email: true } } },
    }),
  ]);

  const items: DeviceActivityItem[] = [];

  for (const event of events) {
    items.push({
      id: `exchange:${event.id}`,
      kind: event.kind,
      source: "exchange",
      direction: event.direction,
      status: event.status,
      at: event.occurredAt.toISOString(),
      title: kindTitle(event.kind),
      summary: event.summary,
      errorCode: event.errorCode,
      durationMs: event.durationMs,
      device: deviceSnapshot(event.device),
      developer: developerSnapshot(event.developer),
      details: {
        ...asRecord(event.requestSummary),
        response: asRecord(event.responseSummary),
      },
      inspect: {
        requestSummary: event.requestSummary,
        responseSummary: event.responseSummary,
      },
    });
  }

  const presenceFallback = events.length === 0;
  if (presenceFallback) {
    for (const device of devices) {
      items.push({
        id: `presence:${device.id}:${device.lastSeenAt.toISOString()}`,
        kind: "heartbeat",
        source: "presence",
        direction: "ingest",
        status: "ok",
        at: device.lastSeenAt.toISOString(),
        title: kindTitle("heartbeat"),
        summary: `${device.hostname} · agent ${device.agentVersion} · ${device.os}`,
        errorCode: null,
        durationMs: null,
        device: deviceSnapshot(device),
        developer: developerSnapshot(device.user),
        details: {
          fallback: true,
          lastSeenAt: device.lastSeenAt.toISOString(),
          lastUsageSyncAt: device.lastUsageSyncAt?.toISOString() ?? null,
          lastAccountSyncAt: device.lastAccountSyncAt?.toISOString() ?? null,
        },
        inspect: {
          requestSummary: {
            note: "Presence fallback until the next agent collect writes activity events.",
          },
          responseSummary: {
            lastSeenAt: device.lastSeenAt.toISOString(),
            lastUsageSyncAt: device.lastUsageSyncAt?.toISOString() ?? null,
            lastAccountSyncAt: device.lastAccountSyncAt?.toISOString() ?? null,
          },
        },
      });
    }
  }

  items.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

  return {
    items: items.slice(0, limit),
    presenceFallback,
  };
}
