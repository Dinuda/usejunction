import { describe, expect, it } from "vitest";
import {
  hasUsageReady,
  isEnrollmentTokenStale,
  isReadyDevice,
  shouldEnterSyncWait,
  shouldServeCachedEnrollmentToken,
} from "@/lib/device-connect-state";

const baseDevice = {
  id: "dev-1",
  hostname: "laptop",
  os: "darwin",
  lastSeenAt: "2026-01-01T00:00:00.000Z",
};

describe("device-connect-state", () => {
  it("treats devices without tools as not ready", () => {
    expect(isReadyDevice({ ...baseDevice, toolInstallations: [] })).toBe(false);
    expect(isReadyDevice({ ...baseDevice, toolInstallations: [{ toolName: "claude" }] })).toBe(true);
  });

  it("requires lastUsageSyncAt for usage readiness", () => {
    expect(hasUsageReady({ ...baseDevice, toolInstallations: [{ toolName: "claude" }] })).toBe(false);
    expect(
      hasUsageReady({
        ...baseDevice,
        toolInstallations: [{ toolName: "claude" }],
        lastUsageSyncAt: "2026-01-01T01:00:00.000Z",
      }),
    ).toBe(true);
  });

  it("enters sync wait for enrolled devices missing tools or usage", () => {
    expect(shouldEnterSyncWait({ ...baseDevice, toolInstallations: [] })).toBe(true);
    expect(
      shouldEnterSyncWait({
        ...baseDevice,
        toolInstallations: [{ toolName: "claude" }],
      }),
    ).toBe(true);
    expect(
      shouldEnterSyncWait({
        ...baseDevice,
        toolInstallations: [{ toolName: "claude" }],
        lastUsageSyncAt: "2026-01-01T01:00:00.000Z",
      }),
    ).toBe(false);
  });

  it("does not serve cached enrollment tokens after consumption", () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    expect(
      shouldServeCachedEnrollmentToken({
        token: "uj_enroll_test",
        controlPlaneUrl: "https://app.example",
        expiresAt: future,
        enrollmentConsumed: true,
      }),
    ).toBe(false);
    expect(
      shouldServeCachedEnrollmentToken({
        token: "uj_enroll_test",
        controlPlaneUrl: "https://app.example",
        expiresAt: future,
        enrollmentConsumed: false,
      }),
    ).toBe(true);
  });

  it("treats expired enrollment tokens as stale", () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    expect(isEnrollmentTokenStale(past)).toBe(true);
    expect(isEnrollmentTokenStale(new Date(Date.now() + 60_000).toISOString())).toBe(false);
  });
});
