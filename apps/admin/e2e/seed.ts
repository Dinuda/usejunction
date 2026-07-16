import { hash } from "bcryptjs";
import { loadEnvConfig } from "@next/env";
import path from "node:path";
import { flowKeyFromSession } from "../lib/signals/policies/flow";

const loadedEnv = loadEnvConfig(path.join(__dirname, "../.."));
if (!process.env.DATABASE_URL && loadedEnv.combinedEnv.DATABASE_URL) {
  process.env.DATABASE_URL = loadedEnv.combinedEnv.DATABASE_URL;
}

const orgSlug = process.env.E2E_ORG_SLUG ?? "e2e-calculation-fixture";
const ownerEmail = process.env.E2E_OWNER_EMAIL ?? "owner@example.com";
const developerEmail = process.env.E2E_DEVELOPER_EMAIL ?? "developer@example.com";
const password = process.env.E2E_OWNER_PASSWORD ?? "e2e-password";
const now = new Date("2026-07-16T12:00:00.000Z");
const journey = flowKeyFromSession({
  appBefore: "Google Chrome",
  domainBefore: "github.com",
  aiTool: "cursor",
  appAfter: "Slack",
  domainAfter: "slack.com",
});
let disconnect: (() => Promise<void>) | null = null;

async function main() {
  const { prisma } = await import("@usejunction/db");
  disconnect = () => prisma.$disconnect();
  const existing = await prisma.organization.findUnique({ where: { slug: orgSlug }, select: { id: true } });
  if (existing) await prisma.organization.delete({ where: { id: existing.id } });
  await prisma.user.deleteMany({ where: { email: { in: [ownerEmail, developerEmail] } } });

  const org = await prisma.organization.create({ data: { name: "Calculation E2E", slug: orgSlug, plan: "pro" } });
  const passwordHash = await hash(password, 10);
  const ownerUser = await prisma.user.create({ data: { name: "E2E Owner", email: ownerEmail, passwordHash, emailVerified: now } });
  const developerUser = await prisma.user.create({ data: { name: "E2E Developer", email: developerEmail, passwordHash, emailVerified: now } });
  await prisma.organizationMembership.createMany({
    data: [
      { orgId: org.id, userId: ownerUser.id, role: "owner", onboardingCompletedAt: now },
      { orgId: org.id, userId: developerUser.id, role: "developer", onboardingCompletedAt: now },
    ],
  });
  await prisma.developer.create({ data: { id: "e2e-owner", orgId: org.id, name: "E2E Owner", email: ownerEmail, role: "owner", authUserId: ownerUser.id } });
  const developer = await prisma.developer.create({ data: { id: "e2e-developer", orgId: org.id, name: "E2E Developer", email: developerEmail, role: "developer", authUserId: developerUser.id } });
  const device = await prisma.device.create({
    data: {
      orgId: org.id,
      userId: developer.id,
      hostname: "e2e-laptop",
      os: "darwin",
      architecture: "arm64",
      agentVersion: "0.1.0",
      deviceToken: "uj_e2e_calculation_device",
      lastSeenAt: now,
      status: "online",
    },
  });
  await prisma.toolInstallation.create({
    data: {
      orgId: org.id,
      userId: developer.id,
      deviceId: device.id,
      toolName: "cursor",
      detected: true,
      configured: true,
      version: "1.0.0",
      lastCheckedAt: now,
    },
  });

  await prisma.billingPlanTemplate.create({
    data: {
      id: "e2e-cursor-pro-plan",
      orgId: org.id,
      provider: "cursor",
      product: "cursor",
      toolName: "cursor",
      toolKey: "cursor",
      catalogPlanKey: "pro",
      name: "Cursor Pro",
      tier: "pro",
      billingCadence: "monthly",
      billingCycleAnchorDate: new Date("2026-07-01T00:00:00.000Z"),
      seatCapacity: 2,
      cycleSeatMicros: BigInt(20_000_000),
      includedCycleMicros: BigInt(5_000_000),
      inputRateMicrosPerMillion: BigInt(2_000_000),
      outputRateMicrosPerMillion: BigInt(4_000_000),
      cacheRateMicrosPerMillion: BigInt(1_000_000),
      createdByUserId: ownerUser.id,
      customPrice: false,
      priceSource: "e2e",
      priceVerifiedAt: new Date("2026-07-01T00:00:00.000Z"),
    },
  });
  await prisma.developerPlanAssignment.create({
    data: {
      id: "e2e-cursor-pro-assignment",
      orgId: org.id,
      developerId: developer.id,
      planTemplateId: "e2e-cursor-pro-plan",
      provider: "cursor",
      product: "cursor",
      toolName: "cursor",
      planName: "Cursor Pro",
      planTier: "pro",
      billingCadence: "monthly",
      billingCycleAnchorDate: new Date("2026-07-01T00:00:00.000Z"),
      cycleSeatMicros: BigInt(20_000_000),
      includedCycleMicros: BigInt(5_000_000),
      inputRateMicrosPerMillion: BigInt(2_000_000),
      outputRateMicrosPerMillion: BigInt(4_000_000),
      cacheRateMicrosPerMillion: BigInt(1_000_000),
      seatCount: 1,
      seatStatus: "active",
      startDate: new Date("2026-07-01T00:00:00.000Z"),
      source: "admin_confirmed",
      createdByUserId: ownerUser.id,
    },
  });
  await prisma.usageDaily.createMany({
    data: [
      {
        orgId: org.id, developerId: developer.id, deviceId: device.id, date: new Date("2026-07-10T00:00:00.000Z"), provider: "cursor", product: "cursor", toolName: "cursor", model: "gpt-4.1", source: "vendor_verified", verified: true, requests: 10, inputTokens: BigInt(1_000_000), outputTokens: BigInt(500_000), costMicros: BigInt(5_000_000), costKind: "verified_usage", dedupeKey: "e2e:cursor:2026-07-10", observedAt: now,
      },
      {
        orgId: org.id, developerId: developer.id, deviceId: device.id, date: new Date("2026-07-11T00:00:00.000Z"), provider: "cursor", product: "cursor", toolName: "cursor", model: "gpt-4.1", source: "estimated", requests: 5, inputTokens: BigInt(100), outputTokens: BigInt(50), costMicros: BigInt(1_000_000), costKind: "estimated_api", dedupeKey: "e2e:cursor:2026-07-11", observedAt: now,
      },
    ],
  });
  await prisma.signalsPolicy.create({
    data: { orgId: org.id, enabled: false, retentionDays: 90, collectionMode: "app_domain", excludedApps: [], excludedDomains: [], storeEvents: false, updatedByUserId: ownerUser.id },
  });
  await prisma.signalsSession.create({
    data: {
      id: "e2e-signal-session",
      orgId: org.id,
      developerId: developer.id,
      deviceId: device.id,
      localId: "e2e-session-1",
      startedAt: new Date("2026-07-15T10:00:00.000Z"),
      endedAt: new Date("2026-07-15T10:02:00.000Z"),
      durationSeconds: 120,
      aiTool: "cursor",
      appBefore: "Google Chrome",
      domainBefore: "github.com",
      appAfter: "Slack",
      domainAfter: "slack.com",
      flowSignature: journey,
      confidence: 0.9,
      collectionMode: "app_domain",
      steps: [{ label: "github.com", startedAt: "2026-07-15T10:00:00.000Z", endedAt: "2026-07-15T10:00:30.000Z" }],
    },
  });

  console.log(JSON.stringify({ orgId: org.id, ownerEmail, developerEmail, password, journey }));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await disconnect?.();
});
