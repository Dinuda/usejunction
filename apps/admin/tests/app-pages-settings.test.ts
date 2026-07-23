import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  getOrCreateNotificationPrefs: vi.fn(),
  getOrgActivitySettings: vi.fn(),
  getOrgSignalsPolicy: vi.fn(),
  getOrgBillingStatus: vi.fn(),
  developerFindMany: vi.fn(),
  organizationFindUnique: vi.fn(),
}));

vi.mock("@usejunction/db", () => ({
  prisma: {
    user: { findUnique: mocks.userFindUnique },
    developer: { findMany: mocks.developerFindMany },
    organization: { findUnique: mocks.organizationFindUnique },
  },
}));

vi.mock("@/lib/notifications/preferences", () => ({
  getOrCreateNotificationPrefs: mocks.getOrCreateNotificationPrefs,
}));

vi.mock("@/lib/activity/service", () => ({
  getOrgActivitySettings: mocks.getOrgActivitySettings,
}));

vi.mock("@/lib/signals/service", () => ({
  getOrgSignalsPolicy: mocks.getOrgSignalsPolicy,
}));

vi.mock("@/lib/saas-billing/status", () => ({
  getOrgBillingStatus: mocks.getOrgBillingStatus,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.userFindUnique.mockResolvedValue({
    timeZone: "America/New_York",
    timeZoneSource: "browser",
    timeZoneManual: false,
  });
  mocks.getOrCreateNotificationPrefs.mockResolvedValue({
    id: "prefs-1",
    dailyPersonalEnabled: true,
    dailyOrgEnabled: false,
  });
  mocks.getOrgActivitySettings.mockResolvedValue({ teamDeviceActivityEnabled: true });
  mocks.getOrgSignalsPolicy.mockResolvedValue({ enabled: true });
  mocks.getOrgBillingStatus.mockResolvedValue({ plan: "team" });
  mocks.developerFindMany.mockResolvedValue([]);
  mocks.organizationFindUnique.mockResolvedValue({ name: "Acme", color: null });
});

describe("loadSettingsPage", () => {
  it("loads prefs and org settings in parallel for owners", async () => {
    const { loadSettingsPage } = await import("@/lib/app-pages/settings");
    const result = await loadSettingsPage({
      userId: "user-1",
      email: "owner@example.test",
      orgId: "org-1",
      role: "owner",
    });

    expect(result.prefs).toMatchObject({
      timeZone: "America/New_York",
      role: "owner",
      dailyPersonalEnabled: true,
      dailyOrgEnabled: false,
    });
    expect(result.orgSettings).toMatchObject({
      orgId: "org-1",
      orgName: "Acme",
    });
    expect(mocks.getOrgActivitySettings).toHaveBeenCalled();
  });

  it("skips org settings for non-admin users", async () => {
    const { loadSettingsPage } = await import("@/lib/app-pages/settings");
    const result = await loadSettingsPage({
      userId: "user-2",
      email: "dev@example.test",
      orgId: "org-1",
      role: "user",
    });

    expect(result.prefs.role).toBe("user");
    expect(result.orgSettings).toBeNull();
    expect(mocks.getOrgActivitySettings).not.toHaveBeenCalled();
  });
});
