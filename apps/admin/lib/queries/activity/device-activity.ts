import { prisma } from "@usejunction/db";
import { workSessionPath } from "@/lib/signals/work-display";
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
  const perSource = Math.min(limit, 40);

  const [events, updateEvents, gatewayRequests, workSessions, signalsSessions, devices] =
    await Promise.all([
      prisma.deviceActivityEvent.findMany({
        where: { orgId, ...developerWhere },
        orderBy: { occurredAt: "desc" },
        take: perSource,
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
      prisma.agentUpdateEvent.findMany({
        where: {
          orgId,
          ...(options.developerId ? { device: { userId: options.developerId } } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: Math.min(perSource, 30),
        include: {
          device: {
            select: {
              id: true,
              hostname: true,
              os: true,
              architecture: true,
              agentVersion: true,
              lastSeenAt: true,
              user: { select: { id: true, name: true, email: true } },
            },
          },
        },
      }),
      prisma.requestMetadata.findMany({
        where: {
          orgId,
          ...(options.developerId ? { userId: options.developerId } : {}),
          deviceId: { not: null },
        },
        orderBy: { createdAt: "desc" },
        take: Math.min(perSource, 30),
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
          user: { select: { id: true, name: true, email: true } },
        },
      }),
      prisma.localWorkSession.findMany({
        where: { orgId, ...developerWhere },
        orderBy: { observedAt: "desc" },
        take: Math.min(perSource, 30),
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
      prisma.signalsSession.findMany({
        where: { orgId, ...developerWhere },
        orderBy: { startedAt: "desc" },
        take: Math.min(perSource, 30),
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

  for (const event of updateEvents) {
    const version =
      event.currentVersion && event.currentVersion !== event.targetVersion
        ? `${event.currentVersion} → ${event.targetVersion}`
        : event.targetVersion;
    items.push({
      id: `agent_update:${event.id}`,
      kind: "agent_update",
      source: "observed",
      direction: "ingest",
      status: event.errorCode || event.eventType.includes("failed") ? "error" : "ok",
      at: event.createdAt.toISOString(),
      title: kindTitle("agent_update"),
      summary: `${event.device.hostname} · ${event.eventType.replaceAll("_", " ")} · ${version}${
        event.stage ? ` · ${event.stage}` : ""
      }`,
      errorCode: event.errorCode,
      durationMs: null,
      device: deviceSnapshot(event.device),
      developer: developerSnapshot(event.device.user),
      details: {
        eventType: event.eventType,
        currentVersion: event.currentVersion,
        targetVersion: event.targetVersion,
        stage: event.stage,
      },
      inspect: {
        requestSummary: {
          eventType: event.eventType,
          currentVersion: event.currentVersion,
          targetVersion: event.targetVersion,
          stage: event.stage,
        },
        responseSummary: {
          errorCode: event.errorCode,
        },
      },
    });
  }

  for (const row of gatewayRequests) {
    if (!row.device) continue;
    const tokens = row.inputTokens + row.outputTokens;
    items.push({
      id: `gateway:${row.id}`,
      kind: "gateway_request",
      source: "observed",
      direction: "observed",
      status: row.status === "success" ? "ok" : row.status,
      at: row.createdAt.toISOString(),
      title: kindTitle("gateway_request"),
      summary: `${row.device.hostname} · ${row.toolName ?? "tool"} · ${row.model ?? "model"} · ${tokens} tokens`,
      errorCode: row.status === "success" ? null : row.status,
      durationMs: row.latencyMs || null,
      device: deviceSnapshot(row.device),
      developer: developerSnapshot(row.user),
      details: {
        toolName: row.toolName,
        model: row.model,
        provider: row.provider,
        inputTokens: row.inputTokens,
        outputTokens: row.outputTokens,
        estimatedCost: row.estimatedCost,
        latencyMs: row.latencyMs,
        source: row.source,
      },
      inspect: {
        requestSummary: {
          toolName: row.toolName,
          model: row.model,
          provider: row.provider,
          source: row.source,
          traceId: row.traceId,
        },
        responseSummary: {
          status: row.status,
          inputTokens: row.inputTokens,
          outputTokens: row.outputTokens,
          estimatedCost: row.estimatedCost,
          latencyMs: row.latencyMs,
        },
      },
    });
  }

  for (const session of workSessions) {
    items.push({
      id: `work:${session.id}`,
      kind: "work_session",
      source: "observed",
      direction: "observed",
      status: "ok",
      at: session.observedAt.toISOString(),
      title: kindTitle("work_session"),
      summary: `${session.device.hostname} · ${session.toolName}${
        session.model ? ` · ${session.model}` : ""
      }${session.title ? ` · ${session.title}` : ""}`,
      errorCode: null,
      durationMs: null,
      device: deviceSnapshot(session.device),
      developer: developerSnapshot(session.developer),
      details: {
        toolName: session.toolName,
        model: session.model,
        mode: session.mode,
        title: session.title,
        tldr: session.tldr,
        href: workSessionPath(session.id),
      },
      inspect: {
        requestSummary: {
          localId: session.localId,
          toolName: session.toolName,
          model: session.model,
          mode: session.mode,
          source: session.source,
        },
        responseSummary: {
          title: session.title,
          tldr: session.tldr,
          overview: session.overview,
          repository: session.repository,
        },
      },
    });
  }

  for (const session of signalsSessions) {
    const before = session.domainBefore ?? session.appBefore ?? "unknown";
    const after = session.domainAfter ?? session.appAfter ?? "unknown";
    items.push({
      id: `signals:${session.id}`,
      kind: "signals_session",
      source: "observed",
      direction: "observed",
      status: "ok",
      at: session.startedAt.toISOString(),
      title: kindTitle("signals_session"),
      summary: `${session.device.hostname} · ${before} → ${session.aiTool} → ${after}`,
      errorCode: null,
      durationMs: session.durationSeconds * 1000,
      device: deviceSnapshot(session.device),
      developer: developerSnapshot(session.developer),
      details: {
        aiTool: session.aiTool,
        appBefore: session.appBefore,
        domainBefore: session.domainBefore,
        appAfter: session.appAfter,
        domainAfter: session.domainAfter,
        confidence: session.confidence,
        durationSeconds: session.durationSeconds,
      },
      inspect: {
        requestSummary: {
          localId: session.localId,
          flowSignature: session.flowSignature,
          collectionMode: session.collectionMode,
        },
        responseSummary: {
          aiTool: session.aiTool,
          appBefore: session.appBefore,
          domainBefore: session.domainBefore,
          appAfter: session.appAfter,
          domainAfter: session.domainAfter,
          steps: session.steps,
          confidence: session.confidence,
        },
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
