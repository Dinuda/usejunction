import { createHash, randomUUID } from "node:crypto";
import { Prisma, prisma } from "@usejunction/db";
import {
  agentReleaseManifestSchema,
  type AgentReleaseManifest,
  type AgentUpdateDirective,
  type AgentUpdateEventType,
  compareAgentVersions,
  summarizeWorkExtractionReadiness,
  WORK_EXTRACTION_MIN_AGENT_VERSION,
} from "./contracts";

type DeviceIdentity = {
  id: string;
  orgId: string;
  os: string;
  architecture: string;
  agentVersion: string;
};

function releaseArtifactsEqual(left: AgentReleaseManifest["artifacts"], right: AgentReleaseManifest["artifacts"]) {
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  if (leftKeys.length !== rightKeys.length || leftKeys.some((key, index) => key !== rightKeys[index])) return false;
  return leftKeys.every((key) => {
    const a = left[key];
    const b = right[key];
    return Boolean(a && b && a.url === b.url && a.sha256.toLowerCase() === b.sha256.toLowerCase() && a.size === b.size);
  });
}

export function artifactKey(os: string, architecture: string) {
  const normalizedOS = os.toLowerCase() === "macos" ? "darwin" : os.toLowerCase();
  const normalizedArch = architecture.toLowerCase() === "x86_64" ? "amd64" : architecture.toLowerCase();
  return `${normalizedOS}-${normalizedArch}`;
}

export function rolloutEligibility(
  deviceId: string,
  version: string,
  rolloutStartedAt: Date,
  rolloutHours: number,
) {
  if (rolloutHours <= 0) return rolloutStartedAt;
  const digest = createHash("sha256").update(`${deviceId}${version}`).digest();
  const bucket = digest.readUInt32BE(0) / 0xffffffff;
  return new Date(rolloutStartedAt.getTime() + bucket * rolloutHours * 60 * 60_000);
}

export async function promoteAgentRelease(input: unknown, now: Date = new Date()) {
  const manifest = agentReleaseManifestSchema.parse(input);
  const rolloutHours = manifest.urgency === "critical" ? 0 : manifest.rolloutHours;

  return prisma.$transaction(async (tx) => {
    const existing = await tx.agentRelease.findUnique({ where: { version: manifest.version } });
    await tx.agentRelease.updateMany({
      where: { status: "active", version: { not: manifest.version } },
      data: { status: "superseded" },
    });

    if (existing) {
      const previousManifest = agentReleaseManifestSchema.safeParse(existing.manifest);
      if (!previousManifest.success || !releaseArtifactsEqual(previousManifest.data.artifacts, manifest.artifacts)) {
        throw new Error("RELEASE_ARTIFACTS_IMMUTABLE");
      }
      const release = await tx.agentRelease.update({
        where: { id: existing.id },
        data: {
          status: "active",
          urgency: manifest.urgency,
          rolloutHours,
          manifest: manifest as unknown as Prisma.InputJsonValue,
        },
      });
      if (manifest.urgency === "critical") {
        await tx.agentUpdateDeployment.updateMany({
          where: { releaseId: release.id, confirmedAt: null },
          data: { eligibleAt: now },
        });
      }
      const cohortSize = await tx.agentUpdateDeployment.count({ where: { releaseId: release.id } });
      return { release, cohortSize };
    }

    const release = await tx.agentRelease.create({
      data: {
        version: manifest.version,
        status: "active",
        urgency: manifest.urgency,
        rolloutHours,
        publishedAt: new Date(manifest.publishedAt),
        rolloutStartedAt: now,
        manifest: manifest as unknown as Prisma.InputJsonValue,
      },
    });

    const devices = await tx.device.findMany({
      where: { decommissionedAt: null },
      select: { id: true, orgId: true, os: true, architecture: true, agentVersion: true },
    });
    const cohort = devices.flatMap((device) => {
      if (!manifest.artifacts[artifactKey(device.os, device.architecture)]) return [];
      const comparison = compareAgentVersions(device.agentVersion, manifest.version);
      const confirmed = comparison !== null && comparison >= 0;
      return [{
        releaseId: release.id,
        orgId: device.orgId,
        deviceId: device.id,
        sourceVersion: device.agentVersion,
        targetVersion: manifest.version,
        eligibleAt: rolloutEligibility(device.id, manifest.version, now, rolloutHours),
        state: confirmed ? "confirmed" : "pending",
        confirmedAt: confirmed ? now : null,
        lastEventAt: confirmed ? now : null,
      }];
    });
    if (cohort.length) {
      await tx.agentUpdateDeployment.createMany({ data: cohort, skipDuplicates: true });
    }
    return { release, cohortSize: cohort.length };
  });
}

export async function pauseAgentRelease(version: string) {
  return prisma.agentRelease.update({ where: { version }, data: { status: "paused" } });
}

async function confirmFromHeartbeat(device: DeviceIdentity, targetVersion: string, now: Date) {
  const deployments = await prisma.agentUpdateDeployment.findMany({
    where: { deviceId: device.id, confirmedAt: null },
    select: { id: true, targetVersion: true },
  });
  for (const deployment of deployments) {
    const comparison = compareAgentVersions(targetVersion, deployment.targetVersion);
    if (comparison === null || comparison < 0) continue;
    await prisma.$transaction([
      prisma.agentUpdateDeployment.update({
        where: { id: deployment.id },
        data: { state: "confirmed", confirmedAt: now, lastEventAt: now, lastErrorCode: null, lastErrorStage: null },
      }),
      prisma.agentUpdateEvent.create({
        data: {
          eventId: `heartbeat:${deployment.id}:${targetVersion}`,
          deploymentId: deployment.id,
          orgId: device.orgId,
          deviceId: device.id,
          eventType: "install_confirmed",
          currentVersion: targetVersion,
          targetVersion: deployment.targetVersion,
        },
      }),
    ]).catch((error) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return;
      throw error;
    });
  }
}

export async function updateDirectiveForDevice(
  device: DeviceIdentity,
  options: { now?: Date; bypassEligibility?: boolean } = {},
): Promise<AgentUpdateDirective | null> {
  const now = options.now ?? new Date();
  await confirmFromHeartbeat(device, device.agentVersion, now);
  const deployment = await prisma.agentUpdateDeployment.findFirst({
    where: {
      deviceId: device.id,
      ...(!options.bypassEligibility ? { eligibleAt: { lte: now } } : {}),
      state: { notIn: options.bypassEligibility ? ["confirmed"] : ["confirmed", "rolled_back"] },
      release: { status: "active" },
    },
    orderBy: { release: { rolloutStartedAt: "desc" } },
    include: { release: true },
  });
  if (!deployment) return null;
  const comparison = compareAgentVersions(device.agentVersion, deployment.targetVersion);
  if (comparison === null || comparison >= 0) return null;
  const parsed = agentReleaseManifestSchema.safeParse(deployment.release.manifest);
  if (!parsed.success) return null;
  const artifact = parsed.data.artifacts[artifactKey(device.os, device.architecture)];
  const selectedArtifactKey = artifactKey(device.os, device.architecture);
  if (!artifact) return null;

  if (!deployment.directiveDeliveredAt) {
    await prisma.$transaction([
      prisma.agentUpdateDeployment.update({
        where: { id: deployment.id },
        data: {
          state: deployment.state === "pending" ? "offered" : deployment.state,
          directiveDeliveredAt: now,
          lastEventAt: now,
        },
      }),
      prisma.agentUpdateEvent.create({
        data: {
          eventId: `directive:${randomUUID()}`,
          deploymentId: deployment.id,
          orgId: device.orgId,
          deviceId: device.id,
          eventType: "directive_delivered",
          currentVersion: device.agentVersion,
          targetVersion: deployment.targetVersion,
        },
      }),
    ]);
  }

  return {
    releaseId: deployment.releaseId,
    attemptId: deployment.id,
    targetVersion: deployment.targetVersion,
    urgency: deployment.release.urgency as "normal" | "critical",
    artifactUrl: artifact.url,
    artifactKey: selectedArtifactKey,
    sha256: artifact.sha256.toLowerCase(),
    size: artifact.size,
    eligibleAt: deployment.eligibleAt.toISOString(),
    manifest: parsed.data,
  };
}

export async function updateDirectiveForHeartbeat(device: DeviceIdentity, now: Date = new Date()) {
  return updateDirectiveForDevice(device, { now });
}

function cleanCode(value: string | undefined) {
  if (!value) return null;
  return value.replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 64);
}

export function nextUpdateState(current: string, event: AgentUpdateEventType) {
  if (event === "install_confirmed") return "confirmed";
  if (event === "rollback_confirmed") return "rolled_back";
  if (current === "confirmed" || current === "rolled_back") return current;
  if (event === "install_failed") return "failed";
  if (current === "failed") return event === "download_started" ? "downloading" : current;
  if (event === "rollback_started") return current;
  const eventState = event === "download_started"
    ? "downloading"
    : event === "download_completed"
      ? "downloaded"
      : event === "install_started"
        ? "installing"
        : current;
  const rank: Record<string, number> = { pending: 0, offered: 1, downloading: 2, downloaded: 3, installing: 4 };
  return (rank[eventState] ?? -1) >= (rank[current] ?? -1) ? eventState : current;
}

export async function recordAgentUpdateEvent(device: DeviceIdentity, input: {
  attemptId: string;
  eventId: string;
  releaseVersion: string;
  event: AgentUpdateEventType;
  currentVersion?: string;
  targetVersion: string;
  stage?: string;
  errorCode?: string;
}, now: Date = new Date()) {
  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.agentUpdateEvent.findUnique({
        where: { deviceId_eventId: { deviceId: device.id, eventId: input.eventId } },
        include: { deployment: true },
      });
      if (existing) return existing.deployment;
      const deployment = await tx.agentUpdateDeployment.findFirst({
        where: {
          id: input.attemptId,
          deviceId: device.id,
          targetVersion: input.targetVersion,
          release: { version: input.releaseVersion },
        },
      });
      if (!deployment) throw new Error("UPDATE_ATTEMPT_NOT_FOUND");

      await tx.agentUpdateEvent.create({
        data: {
          eventId: input.eventId,
          deploymentId: deployment.id,
          orgId: device.orgId,
          deviceId: device.id,
          eventType: input.event,
          currentVersion: input.currentVersion,
          targetVersion: input.targetVersion,
          stage: cleanCode(input.stage),
          errorCode: cleanCode(input.errorCode),
        },
      });
      const data: Prisma.AgentUpdateDeploymentUpdateInput = {
        state: nextUpdateState(deployment.state, input.event),
        lastEventAt: now,
      };
      if (input.event === "download_started") {
        data.downloadStartedAt = deployment.downloadStartedAt ?? now;
        data.attemptCount = { increment: 1 };
        data.lastErrorCode = null;
        data.lastErrorStage = null;
      }
      if (input.event === "download_completed") data.downloadedAt = deployment.downloadedAt ?? now;
      if (input.event === "install_started") data.installStartedAt = deployment.installStartedAt ?? now;
      if (input.event === "install_failed") {
        data.failedAt = now;
        data.lastErrorStage = cleanCode(input.stage);
        data.lastErrorCode = cleanCode(input.errorCode);
      }
      if (input.event === "install_confirmed") {
        data.confirmedAt = now;
        data.lastErrorCode = null;
        data.lastErrorStage = null;
        await tx.device.update({ where: { id: device.id }, data: { agentVersion: input.targetVersion, lastSeenAt: now } });
      }
      if (input.event === "rollback_confirmed") data.rolledBackAt = now;
      return tx.agentUpdateDeployment.update({ where: { id: deployment.id }, data });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const duplicate = await prisma.agentUpdateEvent.findUnique({
        where: { deviceId_eventId: { deviceId: device.id, eventId: input.eventId } },
        include: { deployment: true },
      });
      if (duplicate) return duplicate.deployment;
    }
    throw error;
  }
}

export type AgentUpdateCoverage = Awaited<ReturnType<typeof getAgentUpdateCoverage>>;

type CoverageMetricRow = {
  eligibleAt: Date;
  directiveDeliveredAt: Date | null;
  downloadedAt: Date | null;
  installStartedAt: Date | null;
  state: string;
};

export function calculateCoverageMetrics(rows: CoverageMetricRow[], now: Date = new Date()) {
  const total = rows.length;
  const count = (predicate: (row: CoverageMetricRow) => boolean) => rows.filter(predicate).length;
  const eligible = count((row) => row.eligibleAt <= now);
  const offered = count((row) => Boolean(row.directiveDeliveredAt));
  const downloaded = count((row) => Boolean(row.downloadedAt));
  const attempted = count((row) => Boolean(row.installStartedAt));
  const confirmed = count((row) => row.state === "confirmed");
  const failed = count((row) => row.state === "failed");
  const rolledBack = count((row) => row.state === "rolled_back");
  const pending = rows.filter((row) => !["confirmed", "failed", "rolled_back"].includes(row.state));
  const percent = (numerator: number, denominator: number) => denominator ? Math.round((numerator / denominator) * 1000) / 10 : 0;
  return {
    total,
    eligible,
    offered,
    downloaded,
    attempted,
    confirmed,
    failed,
    rolledBack,
    pending: pending.length,
    pullCoveragePercent: percent(downloaded, total),
    installCoveragePercent: percent(confirmed, total),
    downloadToInstallPercent: percent(confirmed, downloaded),
    failureRatePercent: percent(failed, attempted),
  };
}

export async function getAgentUpdateCoverage(orgId?: string, version?: string, now: Date = new Date()) {
  const release = await prisma.agentRelease.findFirst({
    where: version ? { version } : { status: { in: ["active", "paused"] } },
    orderBy: { rolloutStartedAt: "desc" },
  });
  if (!release) return null;
  const deployments = await prisma.agentUpdateDeployment.findMany({
    where: { releaseId: release.id, ...(orgId ? { orgId } : {}) },
    orderBy: [{ state: "asc" }, { updatedAt: "desc" }],
    include: {
      organization: { select: { id: true, name: true } },
      device: { select: { id: true, hostname: true, os: true, architecture: true, agentVersion: true, lastSeenAt: true, user: { select: { name: true, email: true } } } },
    },
  });
  const metrics = calculateCoverageMetrics(deployments.map((row) => ({
    eligibleAt: row.eligibleAt,
    directiveDeliveredAt: row.directiveDeliveredAt,
    downloadedAt: row.downloadedAt,
    installStartedAt: row.installStartedAt,
    state: row.state,
  })), now);
  return {
    release: { version: release.version, status: release.status, urgency: release.urgency, rolloutHours: release.rolloutHours, rolloutStartedAt: release.rolloutStartedAt?.toISOString() ?? null },
    metrics,
    devices: deployments.map((row) => ({
      attemptId: row.id,
      organization: row.organization,
      device: { ...row.device, lastSeenAt: row.device.lastSeenAt.toISOString() },
      sourceVersion: row.sourceVersion,
      targetVersion: row.targetVersion,
      state: row.state,
      eligibleAt: row.eligibleAt.toISOString(),
      directiveDeliveredAt: row.directiveDeliveredAt?.toISOString() ?? null,
      downloadedAt: row.downloadedAt?.toISOString() ?? null,
      installStartedAt: row.installStartedAt?.toISOString() ?? null,
      confirmedAt: row.confirmedAt?.toISOString() ?? null,
      failedAt: row.failedAt?.toISOString() ?? null,
      rolledBackAt: row.rolledBackAt?.toISOString() ?? null,
      attemptCount: row.attemptCount,
      lastEventAt: row.lastEventAt?.toISOString() ?? null,
      lastErrorStage: row.lastErrorStage,
      lastErrorCode: row.lastErrorCode,
    })),
  };
}

export async function getPlatformAgentUpdateCoverage(version: string, now: Date = new Date()) {
  const coverage = await getAgentUpdateCoverage(undefined, version, now);
  if (!coverage) return null;

  type Row = (typeof coverage.devices)[number];
  const addMilestone = (milestones: Record<string, number>, row: Row) => {
    if (row.eligibleAt <= now.toISOString()) milestones.eligible = (milestones.eligible ?? 0) + 1;
    if (row.directiveDeliveredAt) milestones.directiveDelivered = (milestones.directiveDelivered ?? 0) + 1;
    if (row.downloadedAt) milestones.downloaded = (milestones.downloaded ?? 0) + 1;
    if (row.installStartedAt) milestones.installAttempted = (milestones.installAttempted ?? 0) + 1;
    if (row.state === "confirmed") milestones.confirmed = (milestones.confirmed ?? 0) + 1;
    if (row.state === "failed") milestones.failed = (milestones.failed ?? 0) + 1;
    if (row.state === "rolled_back") milestones.rolledBack = (milestones.rolledBack ?? 0) + 1;
  };
  const summarize = <T extends string>(rows: Row[], keyFor: (row: Row) => T) => {
    const groups = new Map<T, { total: number; states: Record<string, number>; milestones: Record<string, number> }>();
    for (const row of rows) {
      const key = keyFor(row);
      const group = groups.get(key) ?? { total: 0, states: {}, milestones: {} };
      group.total += 1;
      group.states[row.state] = (group.states[row.state] ?? 0) + 1;
      addMilestone(group.milestones, row);
      groups.set(key, group);
    }
    return [...groups.entries()].map(([key, value]) => ({ key, ...value }));
  };

  const organizations = new Map<string, { organizationId: string; name: string; total: number; states: Record<string, number>; milestones: Record<string, number> }>();
  for (const row of coverage.devices) {
    const group = organizations.get(row.organization.id) ?? {
      organizationId: row.organization.id,
      name: row.organization.name,
      total: 0,
      states: {},
      milestones: {},
    };
    group.total += 1;
    group.states[row.state] = (group.states[row.state] ?? 0) + 1;
    addMilestone(group.milestones, row);
    organizations.set(row.organization.id, group);
  }

  return {
    release: coverage.release,
    metrics: coverage.metrics,
    organizations: [...organizations.values()],
    operatingSystems: summarize(coverage.devices, (row) => row.device.os),
    architectures: summarize(coverage.devices, (row) => row.device.architecture),
    installedVersions: summarize(coverage.devices, (row) => row.device.agentVersion),
    lifecycleStates: summarize(coverage.devices, (row) => row.state),
  };
}

export type AccelerateOrgAgentRolloutResult = {
  accelerated: number;
  pendingCount: number;
  reason: "ok" | "no_active_release" | "none_pending";
  targetVersion: string | null;
};

const acceleratingStates = new Set(["pending", "offered", "downloading", "downloaded", "installing", "failed"]);

/**
 * Make this org's unfinished deployments on the active release immediately eligible
 * so enrolled agents pick up the update on the next heartbeat.
 */
export async function accelerateOrgAgentRollout(
  orgId: string,
  now: Date = new Date(),
): Promise<AccelerateOrgAgentRolloutResult> {
  const release = await prisma.agentRelease.findFirst({
    where: { status: "active" },
    orderBy: { rolloutStartedAt: "desc" },
  });
  if (!release) {
    return { accelerated: 0, pendingCount: 0, reason: "no_active_release", targetVersion: null };
  }

  const pending = await prisma.agentUpdateDeployment.findMany({
    where: {
      orgId,
      releaseId: release.id,
      confirmedAt: null,
      state: { in: [...acceleratingStates] },
    },
    select: { id: true },
  });
  if (!pending.length) {
    return {
      accelerated: 0,
      pendingCount: 0,
      reason: "none_pending",
      targetVersion: release.version,
    };
  }

  const result = await prisma.agentUpdateDeployment.updateMany({
    where: { id: { in: pending.map((row) => row.id) } },
    data: { eligibleAt: now, lastEventAt: now },
  });

  return {
    accelerated: result.count,
    pendingCount: pending.length,
    reason: "ok",
    targetVersion: release.version,
  };
}

export async function getWorkExtractionReadiness(orgId: string) {
  const [devices, activeRelease] = await Promise.all([
    prisma.device.findMany({
      where: { orgId, decommissionedAt: null },
      select: { id: true, agentVersion: true },
    }),
    prisma.agentRelease.findFirst({
      where: { status: "active" },
      orderBy: { rolloutStartedAt: "desc" },
      select: { id: true, version: true },
    }),
  ]);

  const updatingIds = new Set<string>();
  if (activeRelease) {
    const rows = await prisma.agentUpdateDeployment.findMany({
      where: {
        orgId,
        releaseId: activeRelease.id,
        confirmedAt: null,
        state: { in: [...acceleratingStates] },
      },
      select: { deviceId: true },
    });
    for (const row of rows) updatingIds.add(row.deviceId);
  }

  return summarizeWorkExtractionReadiness(
    devices.map((device) => ({
      agentVersion: device.agentVersion,
      updating: updatingIds.has(device.id),
    })),
    {
      minAgentVersion: WORK_EXTRACTION_MIN_AGENT_VERSION,
      activeReleaseVersion: activeRelease?.version ?? null,
    },
  );
}
