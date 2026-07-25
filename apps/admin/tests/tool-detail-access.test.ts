import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getOrgActivitySettings: vi.fn(),
  resolveLinkedDeveloperId: vi.fn(),
}));

vi.mock("@/lib/activity/service", () => ({
  getOrgActivitySettings: mocks.getOrgActivitySettings,
}));

vi.mock("@/lib/queries/me/resolve-developer", () => ({
  resolveLinkedDeveloperId: mocks.resolveLinkedDeveloperId,
}));

import { resolveToolDetailAccess } from "../lib/app-pages/tool-detail";
import type { AppPrincipal } from "../lib/api/app-auth";

function principal(role: AppPrincipal["role"]): AppPrincipal {
  return {
    userId: "auth-user-1",
    email: "dev@example.com",
    orgId: "org-1",
    role,
  };
}

describe("resolveToolDetailAccess", () => {
  beforeEach(() => {
    mocks.getOrgActivitySettings.mockReset();
    mocks.resolveLinkedDeveloperId.mockReset();
  });

  it("allows org overview roles without checking the team toggle", async () => {
    await expect(resolveToolDetailAccess(principal("owner"))).resolves.toEqual({
      ok: true,
      scope: "organization",
    });
    await expect(resolveToolDetailAccess(principal("manager"))).resolves.toEqual({
      ok: true,
      scope: "organization",
    });
    expect(mocks.getOrgActivitySettings).not.toHaveBeenCalled();
  });

  it("forbids developers when team tools browse is disabled", async () => {
    mocks.getOrgActivitySettings.mockResolvedValue({
      teamDeviceActivityEnabled: false,
      teamToolsBrowseEnabled: false,
      updatedAt: null,
    });
    await expect(resolveToolDetailAccess(principal("user"))).resolves.toEqual({
      ok: false,
      reason: "forbidden",
    });
  });

  it("allows developers self-scope when the admin toggle is on", async () => {
    mocks.getOrgActivitySettings.mockResolvedValue({
      teamDeviceActivityEnabled: false,
      teamToolsBrowseEnabled: true,
      updatedAt: null,
    });
    mocks.resolveLinkedDeveloperId.mockResolvedValue("developer-1");
    await expect(resolveToolDetailAccess(principal("user"))).resolves.toEqual({
      ok: true,
      scope: "personal",
      developerId: "developer-1",
    });
  });

  it("returns not_linked when the developer profile is missing", async () => {
    mocks.getOrgActivitySettings.mockResolvedValue({
      teamDeviceActivityEnabled: false,
      teamToolsBrowseEnabled: true,
      updatedAt: null,
    });
    mocks.resolveLinkedDeveloperId.mockResolvedValue(null);
    await expect(resolveToolDetailAccess(principal("user"))).resolves.toEqual({
      ok: false,
      reason: "not_linked",
    });
  });
});
