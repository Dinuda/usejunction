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

const enrollmentCredentials = {
  token: "uj_enroll_test",
  expiresAt: new Date(Date.now() + 900_000).toISOString(),
  controlPlaneUrl: "https://app.example",
};

function mockFetch(handlers: Record<string, () => Response | Promise<Response>>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      for (const [pattern, handler] of Object.entries(handlers)) {
        if (url.includes(pattern) && (pattern.includes("enrollment-token") ? method === "POST" : true)) {
          return handler();
        }
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

  it("enters sync wait when parent supplies an enrolled device on mount", async () => {
    mockFetch({
      "/api/onboarding?include=developer": () =>
        new Response(
          JSON.stringify({
            developer: { devices: [enrolledDevice] },
          }),
          { status: 200 },
        ),
    });

    render(
      <DeviceConnectCard
        skipInitialStatusFetch
        initialDevices={[enrolledDevice]}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/Device enrolled — waiting for tool detection/i)).toBeTruthy();
    });
    expect(screen.queryByTestId("platform-command")).toBeNull();

    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    expect(
      fetchMock.mock.calls.some(
        (call) => String(call[0]).includes("/api/onboarding") && call[1]?.method === "POST",
      ),
    ).toBe(false);
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes("/api/me/enrollment-token"))).toBe(
      false,
    );
  });

  it("shows a connect command from parent credentials without bootstrap POST", async () => {
    mockFetch({
      "/api/onboarding?include=developer": () =>
        new Response(JSON.stringify({ developer: { devices: [] } }), { status: 200 }),
    });

    render(
      <DeviceConnectCard
        skipInitialStatusFetch
        initialDevices={[]}
        initialCredentials={enrollmentCredentials}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("platform-command")).toBeTruthy();
    });

    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    expect(
      fetchMock.mock.calls.some(
        (call) => String(call[0]).includes("/api/onboarding") && call[1]?.method === "POST",
      ),
    ).toBe(false);
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes("/api/me/enrollment-token"))).toBe(
      false,
    );
  });

  it("shows a connect command when no device exists yet (standalone)", async () => {
    mockFetch({
      "/api/onboarding?include=developer": () =>
        new Response(JSON.stringify({ developer: { devices: [] } }), { status: 200 }),
      "/api/me/enrollment-token": () =>
        new Response(JSON.stringify(enrollmentCredentials), { status: 201 }),
    });

    render(<DeviceConnectCard />);

    await waitFor(() => {
      expect(screen.getByTestId("platform-command")).toBeTruthy();
    });

    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls.some((url) => url.includes("/api/onboarding") && !url.includes("sync-status"))).toBe(true);
    expect(urls.some((url) => url.includes("/api/me/enrollment-token"))).toBe(true);
    expect(
      fetchMock.mock.calls.some(
        (call) => String(call[0]).includes("/api/onboarding") && call[1]?.method === "POST",
      ),
    ).toBe(false);
  });
});
