// @vitest-environment happy-dom

import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  invalidateAppData: vi.fn(async () => undefined),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

vi.mock("@/lib/api/client", () => ({
  browserMutationInit: (method: string) => ({ method }),
  useInvalidateAppData: () => mocks.invalidateAppData,
}));

vi.mock("sonner", () => ({
  toast: {
    dismiss: vi.fn(),
    error: vi.fn(),
    loading: vi.fn(),
    message: vi.fn(),
    success: vi.fn(),
  },
}));

describe("LocalSyncPanel", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    const storage = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      removeItem: (key: string) => storage.delete(key),
      setItem: (key: string, value: string) => storage.set(key, value),
    });
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));
    vi.stubGlobal("crypto", { randomUUID: () => "sync-request-1" });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("shows queued dashboard work and gives an active device request precedence", async () => {
    const { LocalSyncPanel } = await import("@/components/dashboard/local-sync-panel");
    render(
      <LocalSyncPanel
        scope="team"
        lastSeenAt="2026-08-06T10:00:00.000Z"
        lastUsageSyncAt="2026-08-06T10:00:00.000Z"
        dashboardReady={false}
        dirtyDayCount={6}
      />,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_200);
    });
    expect(screen.getByText(/updating dashboard · 6 days queued/i)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Sync team" }));
    expect(screen.getByText("Syncing team devices…")).toBeTruthy();
    expect(screen.queryByText(/updating dashboard · 6 days queued/i)).toBeNull();
  });
});
