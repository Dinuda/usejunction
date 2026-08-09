import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generateOpaqueToken: vi.fn(() => "uj_enroll_new"),
  hashOpaqueToken: vi.fn((token: string) => `hash:${token}`),
  enrollmentTokenFindFirst: vi.fn(),
  enrollmentTokenDeleteMany: vi.fn(),
  enrollmentTokenCreate: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/security", () => ({
  generateOpaqueToken: mocks.generateOpaqueToken,
  hashOpaqueToken: mocks.hashOpaqueToken,
}));

vi.mock("@usejunction/db", () => ({
  prisma: {
    enrollmentToken: {
      findFirst: mocks.enrollmentTokenFindFirst,
      deleteMany: mocks.enrollmentTokenDeleteMany,
      create: mocks.enrollmentTokenCreate,
    },
    $transaction: mocks.transaction,
  },
}));

function makeTx() {
  return {
    enrollmentToken: {
      findFirst: mocks.enrollmentTokenFindFirst,
      deleteMany: mocks.enrollmentTokenDeleteMany,
      create: mocks.enrollmentTokenCreate,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  mocks.enrollmentTokenDeleteMany.mockResolvedValue({ count: 0 });
  mocks.enrollmentTokenCreate.mockResolvedValue({ id: "enroll_new" });
  mocks.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(makeTx()));
});

test("issueEnrollmentToken reuses an unused reveal when rotate is false", async () => {
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  mocks.enrollmentTokenFindFirst.mockResolvedValue({
    id: "enroll_existing",
    tokenReveal: "uj_enroll_existing",
    expiresAt,
  });

  const { issueEnrollmentToken } = await import("../lib/enrollment-token");
  const issued = await issueEnrollmentToken({
    orgId: "org_1",
    developerId: "dev_1",
    rotate: false,
  });

  assert.equal(issued.id, "enroll_existing");
  assert.equal(issued.token, "uj_enroll_existing");
  assert.equal(issued.expiresAt.toISOString(), expiresAt.toISOString());
  assert.equal(mocks.enrollmentTokenDeleteMany.mock.calls.length, 0);
  assert.equal(mocks.enrollmentTokenCreate.mock.calls.length, 0);
});

test("issueEnrollmentToken rotates when rotate is true", async () => {
  mocks.enrollmentTokenFindFirst.mockResolvedValue({
    id: "enroll_existing",
    tokenReveal: "uj_enroll_existing",
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
  });

  const { issueEnrollmentToken } = await import("../lib/enrollment-token");
  const issued = await issueEnrollmentToken({
    orgId: "org_1",
    developerId: "dev_1",
    rotate: true,
  });

  assert.equal(issued.id, "enroll_new");
  assert.equal(issued.token, "uj_enroll_new");
  assert.equal(mocks.enrollmentTokenDeleteMany.mock.calls.length, 1);
  assert.equal(mocks.enrollmentTokenCreate.mock.calls.length, 1);
  assert.deepEqual(mocks.enrollmentTokenCreate.mock.calls[0][0].data, {
    orgId: "org_1",
    developerId: "dev_1",
    repairDeviceId: null,
    tokenHash: "hash:uj_enroll_new",
    tokenReveal: "uj_enroll_new",
    expiresAt: mocks.enrollmentTokenCreate.mock.calls[0][0].data.expiresAt,
  });
});

test("issueEnrollmentToken creates a new token when none is reusable", async () => {
  mocks.enrollmentTokenFindFirst.mockResolvedValue(null);

  const { issueEnrollmentToken } = await import("../lib/enrollment-token");
  const issued = await issueEnrollmentToken({
    orgId: "org_1",
    developerId: "dev_1",
    rotate: false,
  });

  assert.equal(issued.id, "enroll_new");
  assert.equal(issued.token, "uj_enroll_new");
  assert.equal(mocks.enrollmentTokenDeleteMany.mock.calls.length, 1);
  assert.equal(mocks.enrollmentTokenCreate.mock.calls.length, 1);
});

test("issueRepairEnrollmentToken binds the token to a device", async () => {
  const { issueRepairEnrollmentToken } = await import("../lib/enrollment-token");
  const issued = await issueRepairEnrollmentToken({
    orgId: "org_1",
    developerId: "dev_1",
    deviceId: "device_1",
  });

  assert.equal(issued.id, "enroll_new");
  assert.equal(issued.token, "uj_enroll_new");
  assert.deepEqual(mocks.enrollmentTokenDeleteMany.mock.calls[0]?.[0], {
    where: {
      developerId: "dev_1",
      usedAt: null,
      repairDeviceId: "device_1",
    },
  });
  assert.equal(mocks.enrollmentTokenCreate.mock.calls[0]?.[0].data.repairDeviceId, "device_1");
});
