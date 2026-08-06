import { describe, expect, it } from "vitest";
import { buildPresenceSyncWatermark } from "@/lib/workspace-sync-watermark";

describe("workspace presence watermark", () => {
  it("advances on heartbeats and on 45-minute active-device expiry", () => {
    const initial = buildPresenceSyncWatermark({
      deviceCount: 1,
      activeDeviceCount: 1,
      lastSeenAt: "2026-08-06T10:00:00.000Z",
    });
    const heartbeat = buildPresenceSyncWatermark({
      deviceCount: 1,
      activeDeviceCount: 1,
      lastSeenAt: "2026-08-06T10:15:00.000Z",
    });
    const expired = buildPresenceSyncWatermark({
      deviceCount: 1,
      activeDeviceCount: 0,
      lastSeenAt: "2026-08-06T10:15:00.000Z",
    });

    expect(initial).toBe("1|1|2026-08-06T10:00:00.000Z");
    expect(heartbeat).not.toBe(initial);
    expect(expired).not.toBe(heartbeat);
  });
});
