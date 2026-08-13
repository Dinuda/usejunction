// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MachineConnectionSettingsCard } from "@/components/settings/machine-connection-settings-card";

vi.mock("@/components/panel", () => ({
  Panel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/onboarding/device-connect-card", () => ({
  DeviceConnectCard: () => <div>Connect card</div>,
}));

vi.mock("@/components/onboarding/platform-command", () => ({
  PlatformCommand: () => <div data-testid="platform-command">Repair command</div>,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

function renderWithQueryClient(ui: ReactElement) {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);
}

function mockFetch(handlers: Record<string, () => Response | Promise<Response>>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      for (const [pattern, handler] of Object.entries(handlers)) {
        if (!url.includes(pattern)) continue;
        if (pattern.includes("/repair") && method !== "POST") continue;
        return handler();
      }
      return new Response(JSON.stringify({ error: { code: "NOT_FOUND", message: "Not found" } }), { status: 404 });
    }),
  );
}

describe("MachineConnectionSettingsCard", () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("shows connect UI when no devices are enrolled", async () => {
    mockFetch({
      "/api/app/me/devices": () =>
        new Response(
          JSON.stringify({
            data: { devices: [] },
            meta: { generatedAt: new Date().toISOString(), requestId: "req_1" },
          }),
          { status: 200 },
        ),
    });

    renderWithQueryClient(<MachineConnectionSettingsCard />);

    await waitFor(() => {
      expect(screen.getByText("No machines connected yet.")).toBeTruthy();
    });
    expect(screen.getByRole("button", { name: "Connect machine" })).toBeTruthy();
  });

  it("opens repair dialog when Reconnect is clicked", async () => {
    mockFetch({
      "/api/app/me/devices": () =>
        new Response(
          JSON.stringify({
            data: {
              devices: [
                {
                  id: "device_1",
                  hostname: "MacBook-Pro.local",
                  os: "darwin",
                  architecture: "arm64",
                  lastSeenAt: "2026-08-01T10:00:00.000Z",
                  state: "repair_required",
                },
              ],
            },
            meta: { generatedAt: new Date().toISOString(), requestId: "req_1" },
          }),
          { status: 200 },
        ),
      "/api/me/devices/device_1/repair": () =>
        new Response(
          JSON.stringify({
            commands: {
              macosLinux: "curl install.sh | bash -- --token repair_token",
              windows: "powershell install.ps1 -Token repair_token",
            },
          }),
          { status: 201 },
        ),
    });

    renderWithQueryClient(<MachineConnectionSettingsCard />);

    await waitFor(() => {
      expect(screen.getByText("MacBook-Pro.local")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "Reconnect" }));

    await waitFor(() => {
      expect(screen.getByText("Repair connection.")).toBeTruthy();
      expect(screen.getByTestId("platform-command")).toBeTruthy();
    });

    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    expect(
      fetchMock.mock.calls.some(
        (call) => String(call[0]).includes("/api/me/devices/device_1/repair") && call[1]?.method === "POST",
      ),
    ).toBe(true);
  });
});
