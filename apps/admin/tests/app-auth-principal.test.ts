import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  prismaFindUnique: vi.fn(),
}));

vi.mock("@/auth", () => ({
  auth: mocks.auth,
}));

vi.mock("@usejunction/db", () => ({
  prisma: {
    organizationMembership: {
      findUnique: mocks.prismaFindUnique,
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("requireAppPrincipal", () => {
  it("resolves orgId and role from JWT claims without a membership query", async () => {
    mocks.auth.mockResolvedValue({
      user: {
        id: "user-1",
        email: "user@example.test",
        name: "Test User",
        image: null,
        orgId: "org-1",
        role: "admin",
      },
    });

    const { requireAppPrincipal } = await import("@/lib/api/app-auth");
    const principal = await requireAppPrincipal(new NextRequest("https://usejunction.dev/api/app/team"));

    expect(principal).toMatchObject({
      userId: "user-1",
      email: "user@example.test",
      orgId: "org-1",
      role: "admin",
    });
    expect(mocks.prismaFindUnique).not.toHaveBeenCalled();
  });

  it("returns WORKSPACE_REQUIRED when JWT lacks workspace claims", async () => {
    mocks.auth.mockResolvedValue({
      user: {
        id: "user-1",
        email: "user@example.test",
        orgId: null,
        role: null,
      },
    });

    const { requireAppPrincipal } = await import("@/lib/api/app-auth");
    const response = await requireAppPrincipal(new NextRequest("https://usejunction.dev/api/app/team"));

    expect(response).toBeInstanceOf(Response);
    if (!(response instanceof Response)) throw new Error("expected error response");
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "WORKSPACE_REQUIRED" },
    });
    expect(mocks.prismaFindUnique).not.toHaveBeenCalled();
  });

  it("returns FORBIDDEN when JWT role is outside the allowed set", async () => {
    mocks.auth.mockResolvedValue({
      user: {
        id: "user-1",
        email: "user@example.test",
        orgId: "org-1",
        role: "user",
      },
    });

    const { requireAppPrincipal } = await import("@/lib/api/app-auth");
    const response = await requireAppPrincipal(
      new NextRequest("https://usejunction.dev/api/app/team"),
      ["owner", "admin"],
    );

    expect(response).toBeInstanceOf(Response);
    if (!(response instanceof Response)) throw new Error("expected error response");
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "FORBIDDEN" },
    });
  });

  it("returns UNAUTHENTICATED when there is no session", async () => {
    mocks.auth.mockResolvedValue(null);

    const { requireAppPrincipal } = await import("@/lib/api/app-auth");
    const response = await requireAppPrincipal(new NextRequest("https://usejunction.dev/api/app/team"));

    expect(response).toBeInstanceOf(Response);
    if (!(response instanceof Response)) throw new Error("expected error response");
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "UNAUTHENTICATED" },
    });
  });
});
