// @vitest-environment happy-dom

import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DeviceConnectCard } from "@/components/onboarding/device-connect-card";

vi.mock("@/components/panel", () => ({
  Panel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/tools/tool-brand-icon", () => ({
  hasToolBrandIcon: () => false,
  ToolLogoTile: () => null,
}));

vi.mock("@/components/onboarding/platform-command", () => ({
  PlatformCommand: () => <div data-testid="platform-command">command</div>,
}));

const enrolledDevice = {
  id: "dev-1",
  hostname: "laptop",
  os: "darwin",
  lastSeenAt: "2026-01-01T00:00:00.000Z",
  toolInstallations: [],
};

function mockFetch(handlers: Record<string, () => Response | Promise<Response>>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      for (const [pattern, handler] of Object.entries(handlers)) {
        if (url.includes(pattern)) return handler();
      }
      return new Response(JSON.stringify({}), { status: 404 });
    }),
  );
}

describe("DeviceConnectCard", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("enters sync wait when a device already exists on mount", async () => {
    mockFetch({
      "/api/onboarding?include=developer": () =>
        new Response(
          JSON.stringify({
            developer: { devices: [enrolledDevice] },
          }),
          { status: 200 },
        ),
    });

    render(<DeviceConnectCard />);

    await waitFor(() => {
      expect(screen.getByText(/Device enrolled — waiting for tool detection/i)).toBeTruthy();
    });
    expect(screen.queryByTestId("platform-command")).toBeNull();
  });

  it("shows a connect command when no device exists yet", async () => {
    mockFetch({
      "/api/onboarding?include=developer": () =>
        new Response(JSON.stringify({ developer: { devices: [] } }), { status: 200 }),
      "/api/onboarding": () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
      "/api/me/enrollment-token": () =>
        new Response(
          JSON.stringify({
            token: "uj_enroll_test",
            expiresAt: new Date(Date.now() + 900_000).toISOString(),
            controlPlaneUrl: "https://app.example",
          }),
          { status: 200 },
        ),
    });

    render(<DeviceConnectCard />);

    await waitFor(() => {
      expect(screen.getByTestId("platform-command")).toBeTruthy();
    });
  });
});
