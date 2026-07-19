import assert from "node:assert/strict";
import { test } from "vitest";
import { prisma } from "@usejunction/db";
import {
  getAgentUpdateCoverage,
  getPlatformAgentUpdateCoverage,
  pauseAgentRelease,
  promoteAgentRelease,
  recordAgentUpdateEvent,
  updateDirectiveForDevice,
} from "../lib/agent-updates/service";

test("release cohort, escalation, ownership, idempotency, and confirmation", {
  skip: process.env.RUN_AGENT_UPDATE_DB_TESTS !== "1",
}, async () => {
  const suffix = Date.now().toString(36);
  const version = `99.0.0-${suffix}`;
  const started = new Date("2026-07-16T00:00:00.000Z");
  const escalated = new Date("2026-07-16T01:00:00.000Z");
  const org = await prisma.organization.create({ data: { name: `Update test ${suffix}`, slug: `update-test-${suffix}` } });
  const developer = await prisma.developer.create({
    data: { orgId: org.id, name: "Release Tester", email: `release-${suffix}@example.com`, role: "owner" },
  });
  const createDevice = (hostname: string, os: string, architecture: string, agentVersion: string) => prisma.device.create({
    data: {
      orgId: org.id,
      userId: developer.id,
      hostname,
      os,
      architecture,
      agentVersion,
      deviceToken: `uj_update_test_${suffix}_${hostname}`,
      lastSeenAt: new Date("2026-07-15T00:00:00.000Z"),
    },
  });

  const pendingDevice = await createDevice("pending-linux", "linux", "amd64", "0.1.0");
  const currentDevice = await createDevice("current-mac", "darwin", "arm64", version);
  const windowsDevice = await createDevice("pending-windows", "windows", "amd64", "0.1.0");
  const artifacts = Object.fromEntries(
    ["darwin-amd64", "darwin-arm64", "linux-amd64", "linux-arm64", "windows-amd64", "windows-arm64"].map((key) => [key, {
      url: `https://example.com/${key}`,
      sha256: "a".repeat(64),
      size: 1024,
    }]),
  );
  const manifest = {
    schemaVersion: 2 as const,
    version,
    publishedAt: started.toISOString(),
    urgency: "normal" as const,
    rolloutHours: 24,
    artifacts,
    signingKeyId: "test",
    signature: "a".repeat(86),
  };

  try {
    const promoted = await promoteAgentRelease(manifest, started);
    assert.equal(promoted.cohortSize, 3, "all compatible enrolled devices belong to the fixed cohort");
    const initial = await prisma.agentUpdateDeployment.findMany({ where: { releaseId: promoted.release.id } });
    assert.equal(initial.length, 3);
    assert.equal(initial.find((row) => row.deviceId === currentDevice.id)?.state, "confirmed");

    const postActivation = await createDevice("post-activation", "linux", "arm64", "0.1.0");
    const critical = await promoteAgentRelease({ ...manifest, urgency: "critical", rolloutHours: 0 }, escalated);
    assert.equal(critical.cohortSize, 3);
    const escalatedRows = await prisma.agentUpdateDeployment.findMany({ where: { releaseId: promoted.release.id } });
    assert.equal(escalatedRows.length, 3, "critical escalation must not add post-activation devices");
    assert.equal(escalatedRows.find((row) => row.deviceId === pendingDevice.id)?.eligibleAt.toISOString(), escalated.toISOString());
    await assert.rejects(
      promoteAgentRelease({
        ...manifest,
        urgency: "critical",
        rolloutHours: 0,
        artifacts: { ...artifacts, "linux-amd64": { ...artifacts["linux-amd64"], sha256: "b".repeat(64) } },
      }, escalated),
      /RELEASE_ARTIFACTS_IMMUTABLE/,
    );

    const identity = { id: pendingDevice.id, orgId: org.id, os: "linux", architecture: "amd64", agentVersion: "0.1.0" };
    const directive = await updateDirectiveForDevice(identity, { now: escalated });
    assert.ok(directive);
    const windowsDirective = await updateDirectiveForDevice({
      id: windowsDevice.id,
      orgId: org.id,
      os: "windows",
      architecture: "amd64",
      agentVersion: "0.1.0",
    }, { now: escalated });
    assert.equal(windowsDirective?.artifactKey, "windows-amd64");
    await updateDirectiveForDevice(identity, { now: escalated });
    assert.equal(await prisma.agentUpdateEvent.count({ where: { deploymentId: directive.attemptId, eventType: "directive_delivered" } }), 1);

    const event = {
      attemptId: directive.attemptId,
      eventId: "download-1",
      releaseVersion: version,
      event: "download_started" as const,
      currentVersion: "0.1.0",
      targetVersion: version,
    };
    await Promise.all([
      recordAgentUpdateEvent(identity, event, escalated),
      recordAgentUpdateEvent(identity, event, escalated),
    ]);
    assert.equal((await prisma.agentUpdateDeployment.findUniqueOrThrow({ where: { id: directive.attemptId } })).attemptCount, 1);

    await recordAgentUpdateEvent(identity, { ...event, eventId: "install-1", event: "install_started" }, escalated);
    await recordAgentUpdateEvent(identity, { ...event, eventId: "download-2", event: "download_completed" }, escalated);
    let deployment = await prisma.agentUpdateDeployment.findUniqueOrThrow({ where: { id: directive.attemptId } });
    assert.equal(deployment.state, "installing", "out-of-order download events cannot regress state");
    assert.equal(deployment.confirmedAt, null, "download completion is not installation success");

    await assert.rejects(
      recordAgentUpdateEvent({ ...identity, id: postActivation.id }, { ...event, eventId: "wrong-owner" }, escalated),
      /UPDATE_ATTEMPT_NOT_FOUND/,
    );
    await recordAgentUpdateEvent(identity, { ...event, eventId: "confirmed-1", event: "install_confirmed", currentVersion: version }, escalated);
    deployment = await prisma.agentUpdateDeployment.findUniqueOrThrow({ where: { id: directive.attemptId } });
    assert.equal(deployment.state, "confirmed");
    assert.equal((await prisma.device.findUniqueOrThrow({ where: { id: pendingDevice.id } })).agentVersion, version);

    const coverage = await getAgentUpdateCoverage(org.id, version, escalated);
    assert.equal(coverage?.metrics.total, 3);
    assert.equal(coverage?.metrics.confirmed, 2);
    assert.equal(coverage?.metrics.downloaded, 1);
    const platform = await getPlatformAgentUpdateCoverage(version, escalated);
    assert.equal(platform?.organizations.find((row) => row.organizationId === org.id)?.milestones.downloaded, 1);
    assert.equal(platform?.organizations.find((row) => row.organizationId === org.id)?.milestones.confirmed, 2);
    assert.equal("devices" in (platform ?? {}), false, "platform metrics must not expose device rows");
    await pauseAgentRelease(version);
    assert.equal(await updateDirectiveForDevice({ ...identity, agentVersion: "0.1.0" }, { now: escalated }), null);
  } finally {
    await prisma.agentRelease.deleteMany({ where: { version } });
    await prisma.organization.delete({ where: { id: org.id } });
  }
});

test("accelerateOrgAgentRollout only bumps eligibility for the target org", {
  skip: process.env.RUN_AGENT_UPDATE_DB_TESTS !== "1",
}, async () => {
  const { accelerateOrgAgentRollout } = await import("../lib/agent-updates/service");
  const suffix = Date.now().toString(36);
  const version = `99.1.0-${suffix}`;
  const now = new Date("2026-07-17T12:00:00.000Z");
  const future = new Date("2026-07-18T12:00:00.000Z");

  const orgA = await prisma.organization.create({ data: { name: `Accel A ${suffix}`, slug: `accel-a-${suffix}` } });
  const orgB = await prisma.organization.create({ data: { name: `Accel B ${suffix}`, slug: `accel-b-${suffix}` } });
  const devA = await prisma.developer.create({
    data: { orgId: orgA.id, name: "A", email: `a-${suffix}@example.com`, role: "owner" },
  });
  const devB = await prisma.developer.create({
    data: { orgId: orgB.id, name: "B", email: `b-${suffix}@example.com`, role: "owner" },
  });
  const deviceA = await prisma.device.create({
    data: {
      orgId: orgA.id,
      userId: devA.id,
      hostname: "a-host",
      os: "linux",
      architecture: "amd64",
      agentVersion: "0.1.0",
      deviceToken: `uj_accel_a_${suffix}`,
    },
  });
  const deviceB = await prisma.device.create({
    data: {
      orgId: orgB.id,
      userId: devB.id,
      hostname: "b-host",
      os: "linux",
      architecture: "amd64",
      agentVersion: "0.1.0",
      deviceToken: `uj_accel_b_${suffix}`,
    },
  });

  try {
    const release = await prisma.agentRelease.create({
      data: {
        version,
        status: "active",
        urgency: "normal",
        rolloutHours: 24,
        publishedAt: now,
        rolloutStartedAt: now,
        manifest: {
          schemaVersion: 1,
          version,
          publishedAt: now.toISOString(),
          urgency: "normal",
          rolloutHours: 24,
          signingKeyId: "test",
          signature: "a".repeat(86),
          artifacts: {
            "darwin-arm64": { url: "https://example.com/a", sha256: "a".repeat(64), size: 1 },
            "darwin-amd64": { url: "https://example.com/a", sha256: "a".repeat(64), size: 1 },
            "linux-arm64": { url: "https://example.com/a", sha256: "a".repeat(64), size: 1 },
            "linux-amd64": { url: "https://example.com/a", sha256: "a".repeat(64), size: 1 },
          },
        },
      },
    });
    await prisma.agentUpdateDeployment.createMany({
      data: [
        {
          releaseId: release.id,
          orgId: orgA.id,
          deviceId: deviceA.id,
          sourceVersion: "0.1.0",
          targetVersion: version,
          eligibleAt: future,
          state: "pending",
        },
        {
          releaseId: release.id,
          orgId: orgB.id,
          deviceId: deviceB.id,
          sourceVersion: "0.1.0",
          targetVersion: version,
          eligibleAt: future,
          state: "pending",
        },
      ],
    });

    const result = await accelerateOrgAgentRollout(orgA.id, now);
    assert.equal(result.reason, "ok");
    assert.equal(result.accelerated, 1);
    assert.equal(result.targetVersion, version);

    const rowA = await prisma.agentUpdateDeployment.findFirstOrThrow({
      where: { releaseId: release.id, deviceId: deviceA.id },
    });
    const rowB = await prisma.agentUpdateDeployment.findFirstOrThrow({
      where: { releaseId: release.id, deviceId: deviceB.id },
    });
    assert.equal(rowA.eligibleAt.toISOString(), now.toISOString());
    assert.equal(rowB.eligibleAt.toISOString(), future.toISOString());
  } finally {
    await prisma.agentRelease.deleteMany({ where: { version } });
    await prisma.organization.deleteMany({ where: { id: { in: [orgA.id, orgB.id] } } });
  }
});
