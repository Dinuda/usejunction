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

  const pendingDevice = await createDevice("offline-linux", "linux", "amd64", "0.1.0");
  const currentDevice = await createDevice("current-mac", "darwin", "arm64", version);
  await createDevice("unsupported", "windows", "amd64", "0.1.0");
  const artifacts = Object.fromEntries(
    ["darwin-amd64", "darwin-arm64", "linux-amd64", "linux-arm64"].map((key) => [key, {
      url: `https://example.com/${key}`,
      sha256: "a".repeat(64),
      size: 1024,
    }]),
  );
  const manifest = {
    schemaVersion: 1 as const,
    version,
    publishedAt: started.toISOString(),
    urgency: "normal" as const,
    rolloutHours: 24,
    artifacts,
  };

  try {
    const promoted = await promoteAgentRelease(manifest, started);
    assert.equal(promoted.cohortSize, 2, "compatible offline devices belong to the fixed cohort");
    const initial = await prisma.agentUpdateDeployment.findMany({ where: { releaseId: promoted.release.id } });
    assert.equal(initial.length, 2);
    assert.equal(initial.find((row) => row.deviceId === currentDevice.id)?.state, "confirmed");

    const postActivation = await createDevice("post-activation", "linux", "arm64", "0.1.0");
    const critical = await promoteAgentRelease({ ...manifest, urgency: "critical", rolloutHours: 0 }, escalated);
    assert.equal(critical.cohortSize, 2);
    const escalatedRows = await prisma.agentUpdateDeployment.findMany({ where: { releaseId: promoted.release.id } });
    assert.equal(escalatedRows.length, 2, "critical escalation must not add post-activation devices");
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
    assert.equal(coverage?.metrics.total, 2);
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
