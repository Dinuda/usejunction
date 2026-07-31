import { beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
}));

vi.mock("@usejunction/db", () => ({
  Prisma: {
    sql: vi.fn(),
    join: vi.fn(),
  },
  prisma: {
    localWorkSession: { findMany: mocks.findMany },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findMany.mockResolvedValue([]);
});

test("unfiltered Team Signals windows constrain the organization and observed-at range", async () => {
  const { readLocalWorkSessionsWindow } = await import("@/lib/signals/readers/work-sessions");
  await readLocalWorkSessionsWindow("org-1", {
    from: new Date("2026-07-01T18:00:00.000Z"),
    to: new Date("2026-07-10T18:00:00.000Z"),
  });

  expect(mocks.findMany.mock.calls[0]?.[0].where).toEqual({
    orgId: "org-1",
    observedAt: {
      gte: new Date("2026-07-01T00:00:00.000Z"),
      lt: new Date("2026-07-11T00:00:00.000Z"),
    },
  });
});

test("filtered Team Signals windows retain developer and tool predicates", async () => {
  const { readLocalWorkSessionsWindow } = await import("@/lib/signals/readers/work-sessions");
  await readLocalWorkSessionsWindow("org-1", {
    from: new Date("2026-07-01T00:00:00.000Z"),
    to: new Date("2026-07-10T00:00:00.000Z"),
    developerId: "developer-1",
    tool: "cursor",
  });

  expect(mocks.findMany.mock.calls[0]?.[0].where).toMatchObject({
    orgId: "org-1",
    developerId: "developer-1",
    toolName: "cursor",
  });
});
