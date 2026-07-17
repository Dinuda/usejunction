import { prisma } from "@usejunction/db";
import { isDeviceOnline } from "@/lib/devices/presence";
import type {
  DeviceActivityExtraction,
  DeviceActivityFeed,
  DeviceActivityItem,
} from "@/lib/queries/activity/device-activity-types";

export type {
  DeviceActivityExtraction,
  DeviceActivityFeed,
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
  now: Date,
) {
  return {
    id: device.id,
    hostname: device.hostname,
    os: device.os,
    architecture: device.architecture,
    agentVersion: device.agentVersion,
    online: isDeviceOnline(device.lastSeenAt, now),
  };
}

function developerSnapshot(user: { id: string; name: string; email: string } | null) {
  if (!user) return null;
  return { id: user.id, name: user.name, email: user.email };
}

export async function getDeviceActivityFeed(
  orgId: string,
  options: { developerId?: string; limit?: number; now?: Date } = {},
): Promise<DeviceActivityFeed> {
  const limit = Math.min(options.limit ?? 50, 100);
  const now = options.now ?? new Date();
  const developerWhere = options.developerId ? { userId: options.developerId } : {};

  const [devices, updateEvents] = await Promise.all([
    prisma.device.findMany({
      where: { orgId, ...developerWhere },
      orderBy: { lastSeenAt: "desc" },
      take: 40,
      include: {
        user: { select: { id: true, name: true, email: true } },
        toolInstallations: {
          orderBy: { lastCheckedAt: "desc" },
          select: {
            toolName: true,
            version: true,
            detected: true,
            configured: true,
            lastCheckedAt: true,
          },
        },
        toolAccounts: {
          orderBy: { updatedAt: "desc" },
          select: {
            toolName: true,
            email: true,
            plan: true,
            loginMethod: true,
            authPresent: true,
            updatedAt: true,
          },
        },
        quotaSnapshots: {
          orderBy: { updatedAt: "desc" },
          select: {
            toolName: true,
            windowType: true,
            usedPercent: true,
            creditsRemaining: true,
            source: true,
            updatedAt: true,
          },
        },
        localUsageAggregates: {
          orderBy: [{ date: "desc" }, { toolName: "asc" }, { model: "asc" }],
          take: 100,
          select: {
            date: true,
            toolName: true,
            model: true,
            requests: true,
            inputTokens: true,
            outputTokens: true,
            estimatedCost: true,
            metricKind: true,
          },
        },
      },
    }),
    prisma.agentUpdateEvent.findMany({
      where: { orgId, ...(options.developerId ? { device: { userId: options.developerId } } : {}) },
      orderBy: { createdAt: "desc" },
      take: 30,
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
  ]);

  const items: DeviceActivityItem[] = [];

  for (const device of devices) {
    const snapshot = deviceSnapshot(device, now);
    const developer = developerSnapshot(device.user);
    const extraction: DeviceActivityExtraction = {
      tools: device.toolInstallations.map((row) => ({
        toolName: row.toolName,
        version: row.version,
        detected: row.detected,
        configured: row.configured,
        lastCheckedAt: row.lastCheckedAt.toISOString(),
      })),
      accounts: device.toolAccounts.map((row) => ({
        toolName: row.toolName,
        email: row.email,
        plan: row.plan,
        loginMethod: row.loginMethod,
        authPresent: row.authPresent,
        updatedAt: row.updatedAt.toISOString(),
      })),
      quotas: device.quotaSnapshots.map((row) => ({
        toolName: row.toolName,
        windowType: row.windowType,
        usedPercent: row.usedPercent,
        creditsRemaining: row.creditsRemaining,
        source: row.source,
        updatedAt: row.updatedAt.toISOString(),
      })),
      usage: device.localUsageAggregates.map((row) => ({
        date: row.date.toISOString().slice(0, 10),
        toolName: row.toolName,
        model: row.model,
        requests: row.requests,
        inputTokens: row.inputTokens,
        outputTokens: row.outputTokens,
        estimatedCost: row.estimatedCost,
        metricKind: row.metricKind,
      })),
    };

    items.push({
      id: `heartbeat:${device.id}:${device.lastSeenAt.toISOString()}`,
      kind: "heartbeat",
      at: device.lastSeenAt.toISOString(),
      device: snapshot,
      developer,
    });

    if (device.lastUsageSyncAt) {
      items.push({
        id: `sync:usage:${device.id}:${device.lastUsageSyncAt.toISOString()}`,
        kind: "sync",
        syncKind: "usage",
        at: device.lastUsageSyncAt.toISOString(),
        device: snapshot,
        developer,
        extraction,
      });
    }

    if (device.lastAccountSyncAt) {
      items.push({
        id: `sync:accounts:${device.id}:${device.lastAccountSyncAt.toISOString()}`,
        kind: "sync",
        syncKind: "accounts",
        at: device.lastAccountSyncAt.toISOString(),
        device: snapshot,
        developer,
        extraction,
      });
    }
  }

  for (const event of updateEvents) {
    items.push({
      id: `agent_update:${event.id}`,
      kind: "agent_update",
      at: event.createdAt.toISOString(),
      eventType: event.eventType,
      currentVersion: event.currentVersion,
      targetVersion: event.targetVersion,
      stage: event.stage,
      errorCode: event.errorCode,
      device: deviceSnapshot(event.device, now),
      developer: developerSnapshot(event.device.user),
    });
  }

  items.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

  return { items: items.slice(0, limit) };
}
