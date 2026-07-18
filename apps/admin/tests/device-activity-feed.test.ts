import assert from "node:assert/strict";
import { test } from "vitest";
import { prisma } from "@usejunction/db";
import {
  enforceDeviceActivityRetention,
  recordDeviceActivityEvent,
} from "../lib/activity/record-device-activity-event";
import { getDeviceActivityFeed } from "../lib/queries/activity/device-activity";

const runDb = process.env.RUN_DEVICE_ACTIVITY_DB_TESTS === "1" || Boolean(process.env.DATABASE_URL);

test("recordDeviceActivityEvent and feed merge exchange + observed rows", {
  skip: !runDb,
}, async () => {
  const suffix = Date.now().toString(36);
  const org = await prisma.organization.create({
    data: { name: `Device activity ${suffix}`, slug: `device-activity-${suffix}` },
  });
  const developer = await prisma.developer.create({
    data: {
      orgId: org.id,
      name: "Activity Dev",
      email: `activity-dev-${suffix}@example.com`,
    },
  });
  const device = await prisma.device.create({
    data: {
      orgId: org.id,
      userId: developer.id,
      hostname: `host-${suffix}.local`,
      os: "darwin",
      architecture: "arm64",
      agentVersion: "0.0.0-test",
      deviceToken: `tok-${suffix}`,
      lastSeenAt: new Date(),
    },
  });

  try {
    await recordDeviceActivityEvent({
      orgId: org.id,
      developerId: developer.id,
      deviceId: device.id,
      kind: "usage",
      status: "ok",
      summary: "Usage sync · 2 rows · cursor · 1.2K tokens",
      requestSummary: {
        aggregates: 2,
        tools: ["cursor"],
        models: ["gpt-5"],
        deviceToken: "should-redact",
        sample: [
          { date: "2026-07-18", toolName: "cursor", model: "gpt-5", requests: 2, tokens: 1200 },
        ],
      },
      responseSummary: { upserted: 2 },
    });

    await prisma.requestMetadata.create({
      data: {
        orgId: org.id,
        userId: developer.id,
        deviceId: device.id,
        toolName: "cursor",
        provider: "openai",
        model: "gpt-5",
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        estimatedCost: 0.01,
        latencyMs: 120,
        status: "success",
        source: "gateway",
      },
    });

    await prisma.localWorkSession.create({
      data: {
        orgId: org.id,
        developerId: developer.id,
        deviceId: device.id,
        localId: `work-${suffix}`,
        toolName: "cursor",
        model: "gpt-5",
        title: "Refactor activity feed",
        observedAt: new Date(),
        source: "test",
      },
    });

    const feed = await getDeviceActivityFeed(org.id, { limit: 20, now: new Date() });
    assert.equal(feed.presenceFallback, false);
    assert.ok(feed.items.some((item) => item.kind === "usage" && item.source === "exchange"));
    assert.ok(feed.items.some((item) => item.kind === "gateway_request"));
    assert.ok(feed.items.some((item) => item.kind === "work_session"));

    const usage = feed.items.find((item) => item.kind === "usage");
    assert.ok(usage);
    const request = usage!.inspect.requestSummary as Record<string, unknown>;
    assert.equal(request.deviceToken, "[redacted]");

    const scoped = await getDeviceActivityFeed(org.id, {
      developerId: developer.id,
      limit: 10,
    });
    assert.ok(scoped.items.every((item) => !item.developer || item.developer.id === developer.id));

    const stored = await prisma.deviceActivityEvent.findFirst({
      where: { orgId: org.id, kind: "usage" },
    });
    assert.ok(stored);
    assert.equal((stored!.requestSummary as Record<string, unknown>).deviceToken, "[redacted]");

    await prisma.deviceActivityEvent.update({
      where: { id: stored!.id },
      data: { occurredAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000) },
    });
    const pruned = await enforceDeviceActivityRetention(org.id, 30);
    assert.ok(pruned >= 1);
  } finally {
    await prisma.organization.delete({ where: { id: org.id } });
  }
});
