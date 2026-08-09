import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  enrollmentFindUnique: vi.fn(),
  telemetryFindUnique: vi.fn(),
  transaction: vi.fn(),
  assertCanEnrollDevice: vi.fn(),
  deviceUpdate: vi.fn(),
  deviceCreate: vi.fn(),
  enrollmentUpdateMany: vi.fn(),
  deviceFindFirst: vi.fn(),
}));

vi.mock("@usejunction/db", () => ({
  Prisma: { PrismaClientKnownRequestError: class PrismaClientKnownRequestError extends Error {} },
  prisma: {
    enrollmentToken: { findUnique: mocks.enrollmentFindUnique },
    telemetryEndpoint: { findUnique: mocks.telemetryFindUnique },
    $transaction: mocks.transaction,
  },
}));

vi.mock("@/lib/saas-billing/status", () => ({
  assertCanEnrollDevice: mocks.assertCanEnrollDevice,
}));

vi.mock("@/lib/auth", () => ({
  generateDeviceToken: () => "uj_dev_new_token",
}));

vi.mock("@/lib/agent-updates", () => ({
  normalizeAgentVersion: (_v: string, fallback?: string) => fallback ?? _v,
}));

vi.mock("@/lib/public-url", () => ({
  getPublicAppUrl: () => "https://usejunction.dev",
}));

vi.mock("@/lib/security", () => ({
  hashOpaqueToken: (token: string) => `hash:${token}`,
}));

vi.mock("@/lib/security/http", () => ({
  limitedJson: async () => ({
    ok: true,
    data: {
      token: "uj_enroll_repair_token",
      hostname: "MacBook-Pro.local",
      os: "darwin",
      architecture: "arm64",
      agentVersion: "0.3.4",
    },
  }),
}));

vi.mock("@/lib/security/rate-limit", () => ({
  enforceRateLimit: async () => true,
}));

vi.mock("@/lib/errors/public", () => ({
  logServerError: vi.fn(),
}));

function makeTx() {
  return {
    enrollmentToken: { updateMany: mocks.enrollmentUpdateMany },
    device: {
      findFirst: mocks.deviceFindFirst,
      update: mocks.deviceUpdate,
      create: mocks.deviceCreate,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.telemetryFindUnique.mockResolvedValue({ enabled: true });
  mocks.assertCanEnrollDevice.mockResolvedValue({ allowed: true });
  mocks.enrollmentUpdateMany.mockResolvedValue({ count: 1 });
  mocks.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(makeTx()));
});

test("POST /api/enroll repair token rotates credentials on the same device", async () => {
  mocks.enrollmentFindUnique.mockResolvedValue({
    id: "enroll_1",
    orgId: "org_1",
    repairDeviceId: "device_1",
    usedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
    developer: { id: "dev_1" },
  });
  mocks.deviceFindFirst.mockResolvedValue({
    id: "device_1",
    hostname: "MacBook-Pro.local",
    os: "darwin",
    architecture: "arm64",
    agentVersion: "0.3.4",
  });
  mocks.deviceUpdate.mockResolvedValue({
    id: "device_1",
    userId: "dev_1",
    orgId: "org_1",
  });

  const { POST } = await import("@/app/api/enroll/route");
  const response = await POST(
    new Request("https://usejunction.dev/api/enroll", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: "uj_enroll_repair_token" }),
    }) as never,
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.deviceId, "device_1");
  assert.equal(body.deviceToken, "uj_dev_new_token");
  assert.equal(mocks.assertCanEnrollDevice.mock.calls.length, 0);
  assert.equal(mocks.deviceCreate.mock.calls.length, 0);
  assert.equal(mocks.deviceUpdate.mock.calls.length, 1);
  assert.equal(mocks.deviceUpdate.mock.calls[0]?.[0].where.id, "device_1");
  assert.equal(mocks.deviceUpdate.mock.calls[0]?.[0].data.deviceTokenHash, "hash:uj_dev_new_token");
});

test("POST /api/enroll repair token rejects unavailable devices", async () => {
  mocks.enrollmentFindUnique.mockResolvedValue({
    id: "enroll_1",
    orgId: "org_1",
    repairDeviceId: "device_1",
    usedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
    developer: { id: "dev_1" },
  });
  mocks.deviceFindFirst.mockResolvedValue(null);

  const { POST } = await import("@/app/api/enroll/route");
  const response = await POST(
    new Request("https://usejunction.dev/api/enroll", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: "uj_enroll_repair_token" }),
    }) as never,
  );

  assert.equal(response.status, 410);
});
