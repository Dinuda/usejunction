import { prisma, type Prisma, type ProviderConnection } from "@usejunction/db";
import { normalizeEmail } from "@/lib/developer-identity";
import { getAdapter } from "@/lib/integrations/adapters";
import { githubInstallationToken } from "@/lib/integrations/github-app";
import type { IntegrationConfig, ProviderMember, ProviderUsage } from "@/lib/integrations/types";
import { decryptSecret } from "@/lib/security";

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? {})) as Prisma.InputJsonValue;
}

function configOf(connection: ProviderConnection): IntegrationConfig {
  return (connection.config ?? {}) as IntegrationConfig;
}

async function upsertMember(connection: ProviderConnection, member: ProviderMember) {
  const email = member.email ? normalizeEmail(member.email) : null;
  let developer = email
    ? await prisma.developer.findUnique({ where: { orgId_email: { orgId: connection.orgId, email } } })
    : null;
  if (!developer && email) {
    developer = await prisma.developer.create({
      data: { orgId: connection.orgId, email, name: member.name?.trim() || email.split("@")[0], role: "developer" },
    });
  }
  return prisma.externalIdentity.upsert({
    where: { orgId_provider_externalUserId: { orgId: connection.orgId, provider: connection.provider, externalUserId: member.externalUserId } },
    update: {
      developerId: developer?.id ?? undefined,
      connectionId: connection.id,
      email,
      displayName: member.name ?? null,
      matchedBy: developer ? "email" : null,
      observedAt: new Date(),
      metadata: json(member.metadata),
    },
    create: {
      orgId: connection.orgId,
      developerId: developer?.id ?? null,
      connectionId: connection.id,
      provider: connection.provider,
      externalUserId: member.externalUserId,
      email,
      displayName: member.name ?? null,
      source: "vendor_verified",
      matchedBy: developer ? "email" : null,
      metadata: json(member.metadata),
    },
  });
}

async function developerForUsage(connection: ProviderConnection, row: ProviderUsage) {
  if (row.externalUserId) {
    const identity = await prisma.externalIdentity.findUnique({
      where: { orgId_provider_externalUserId: { orgId: connection.orgId, provider: connection.provider, externalUserId: row.externalUserId } },
      select: { developerId: true },
    });
    if (identity?.developerId) return identity.developerId;
  }
  if (row.email) {
    const developer = await prisma.developer.findUnique({ where: { orgId_email: { orgId: connection.orgId, email: normalizeEmail(row.email) } }, select: { id: true } });
    return developer?.id ?? null;
  }
  return null;
}

export async function validateConnection(connection: ProviderConnection) {
  const credential = await credentialForConnection(connection);
  const adapter = getAdapter(connection.provider, connection.product);
  return adapter.validate({ credential, config: configOf(connection), initialSync: !connection.lastSyncedAt, now: new Date() });
}

async function credentialForConnection(connection: ProviderConnection) {
  const config = configOf(connection);
  if (connection.provider === "github" && connection.method === "oauth" && config.installationId) {
    return githubInstallationToken(String(config.installationId));
  }
  if (!connection.credentialCiphertext) throw new Error("connection has no credential");
  return decryptSecret(connection.credentialCiphertext);
}

export async function syncConnection(connectionId: string) {
  const connection = await prisma.providerConnection.findUnique({ where: { id: connectionId } });
  if (!connection || connection.status === "disconnected") throw new Error("connection not available");
  const run = await prisma.providerSyncRun.create({ data: { orgId: connection.orgId, connectionId: connection.id } });
  try {
    const adapter = getAdapter(connection.provider, connection.product);
    const data = await adapter.sync({ credential: await credentialForConnection(connection), config: configOf(connection), initialSync: !connection.lastSyncedAt, now: new Date() });
    const identities = new Map<string, Awaited<ReturnType<typeof upsertMember>>>();
    for (const member of data.members) {
      if (!member.externalUserId || identities.has(member.externalUserId)) continue;
      identities.set(member.externalUserId, await upsertMember(connection, member));
    }

    for (const seat of data.seats) {
      const identity = identities.get(seat.externalUserId) ?? await prisma.externalIdentity.findUnique({
        where: { orgId_provider_externalUserId: { orgId: connection.orgId, provider: connection.provider, externalUserId: seat.externalUserId } },
      });
      await prisma.seatAssignment.upsert({
        where: { connectionId_externalUserId: { connectionId: connection.id, externalUserId: seat.externalUserId } },
        update: { developerId: identity?.developerId ?? null, plan: seat.plan ?? null, status: seat.status ?? "active", assignedAt: seat.assignedAt ?? null, lastActivityAt: seat.lastActivityAt ?? null, observedAt: new Date(), metadata: json(seat.metadata) },
        create: { orgId: connection.orgId, connectionId: connection.id, developerId: identity?.developerId ?? null, externalUserId: seat.externalUserId, provider: connection.provider, product: seat.product, plan: seat.plan ?? null, status: seat.status ?? "active", source: "vendor_verified", assignedAt: seat.assignedAt ?? null, lastActivityAt: seat.lastActivityAt ?? null, metadata: json(seat.metadata) },
      });
    }

    for (const row of data.usage) {
      const developerId = await developerForUsage(connection, row);
      const dedupeKey = `${connection.id}:${row.externalKey}`;
      await prisma.usageDaily.upsert({
        where: { orgId_dedupeKey: { orgId: connection.orgId, dedupeKey } },
        update: {
          developerId, date: row.date, provider: row.provider, product: row.product, toolName: row.toolName ?? "", model: row.model ?? "",
          requests: row.requests ?? 0, sessions: row.sessions ?? 0, inputTokens: row.inputTokens ?? BigInt(0), outputTokens: row.outputTokens ?? BigInt(0),
          cacheReadTokens: row.cacheReadTokens ?? BigInt(0), activeSeconds: row.activeSeconds ?? BigInt(0), suggestedLines: row.suggestedLines ?? BigInt(0),
          acceptedLines: row.acceptedLines ?? BigInt(0), addedLines: row.addedLines ?? BigInt(0), deletedLines: row.deletedLines ?? BigInt(0),
          commits: row.commits ?? 0, pullRequests: row.pullRequests ?? 0, costMicros: row.costMicros ?? BigInt(0), observedAt: new Date(), metadata: json(row.metadata),
        },
        create: {
          orgId: connection.orgId, developerId, connectionId: connection.id, date: row.date, provider: row.provider, product: row.product,
          toolName: row.toolName ?? "", model: row.model ?? "", source: "vendor_verified", sourceRef: row.externalKey, verified: true,
          requests: row.requests ?? 0, sessions: row.sessions ?? 0, inputTokens: row.inputTokens ?? BigInt(0), outputTokens: row.outputTokens ?? BigInt(0),
          cacheReadTokens: row.cacheReadTokens ?? BigInt(0), activeSeconds: row.activeSeconds ?? BigInt(0), suggestedLines: row.suggestedLines ?? BigInt(0),
          acceptedLines: row.acceptedLines ?? BigInt(0), addedLines: row.addedLines ?? BigInt(0), deletedLines: row.deletedLines ?? BigInt(0),
          commits: row.commits ?? 0, pullRequests: row.pullRequests ?? 0, costMicros: row.costMicros ?? BigInt(0), dedupeKey, metadata: json(row.metadata),
        },
      });
    }
    const counts = { members: identities.size, seats: data.seats.length, usage: data.usage.length };
    const now = new Date();
    await prisma.$transaction([
      prisma.providerConnection.update({ where: { id: connection.id }, data: { status: "active", externalOrgId: data.externalOrgId ?? connection.externalOrgId, permissions: json(data.permissions ?? []), lastSyncedAt: now, nextSyncAt: new Date(now.getTime() + 15 * 60_000), leaseUntil: null, lastError: null } }),
      prisma.providerSyncRun.update({ where: { id: run.id }, data: { status: "success", finishedAt: now, counts } }),
    ]);
    return counts;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const now = new Date();
    await prisma.$transaction([
      prisma.providerConnection.update({ where: { id: connection.id }, data: { status: connection.lastSyncedAt ? "degraded" : "error", lastError: message.slice(0, 4000), leaseUntil: null, nextSyncAt: new Date(now.getTime() + 15 * 60_000) } }),
      prisma.providerSyncRun.update({ where: { id: run.id }, data: { status: "error", finishedAt: now, error: message.slice(0, 4000) } }),
    ]);
    throw error;
  }
}

export async function claimDueConnections(limit = 5) {
  const now = new Date();
  const candidates = await prisma.providerConnection.findMany({
    where: { status: { in: ["active", "degraded", "pending", "error"] }, AND: [{ OR: [{ nextSyncAt: null }, { nextSyncAt: { lte: now } }] }, { OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] }] },
    orderBy: [{ nextSyncAt: "asc" }, { createdAt: "asc" }],
    take: limit * 2,
  });
  const claimed: string[] = [];
  for (const candidate of candidates) {
    if (claimed.length >= limit) break;
    const result = await prisma.providerConnection.updateMany({
      where: { id: candidate.id, OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] },
      data: { leaseUntil: new Date(now.getTime() + 5 * 60_000) },
    });
    if (result.count === 1) claimed.push(candidate.id);
  }
  return claimed;
}
