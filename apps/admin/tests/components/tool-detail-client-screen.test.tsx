// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "../setup/component";

const mocks = vi.hoisted(() => ({
  useAppQuery: vi.fn(),
  useAppPageQuery: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ toolKey: "chatgpt-codex" }),
  useRouter: () => ({ replace: mocks.replace }),
  useSearchParams: () => new URLSearchParams("view=current_cycles&days=30"),
}));

vi.mock("@/lib/api/client", () => ({
  useAppQuery: mocks.useAppQuery,
  useAppPageQuery: mocks.useAppPageQuery,
}));

vi.mock("@/components/dashboard/connection-repair-banner", () => ({
  ConnectionRepairBanner: () => <div>repair banner</div>,
}));

vi.mock("@/components/dashboard/local-sync-panel", () => ({
  LocalSyncPanel: ({
    dirtyDayCount,
    dashboardReady,
  }: {
    dirtyDayCount?: number;
    dashboardReady?: boolean;
  }) => (
    <div data-testid="sync-panel">
      dirty={dirtyDayCount ?? 0} ready={dashboardReady === false ? "no" : "yes"}
    </div>
  ),
}));

vi.mock("@/components/tools/tool-provider-detail", () => ({
  ToolProviderDetail: ({ data }: { data: { kpis: { requests: number } } }) => (
    <div data-testid="tool-metrics">requests={data.kpis.requests}</div>
  ),
}));

vi.mock("@/components/app-data-state", () => ({
  AppPageError: ({ error }: { error: Error }) => <div>{error.message}</div>,
  AppPageSkeleton: () => <div data-testid="page-skeleton">page loading</div>,
  isBlockingAppQueryError: (error: unknown, hasData: boolean) => Boolean(error) && !hasData,
  useAppQueryErrorToast: vi.fn(),
}));

const shellData = {
  kind: "organization" as const,
  slice: "shell" as const,
  rawToolKey: "chatgpt-codex",
  toolKey: "chatgpt-codex",
  syncContext: {
    scope: "team" as const,
    lastSeenAt: "2026-08-03T10:00:00.000Z",
    lastUsageSyncAt: "2026-08-03T10:00:00.000Z",
    lastAccountSyncAt: null,
    hasLocalEndpoint: false,
    needsPlanSync: false,
    deviceCount: 2,
    remoteCapableDeviceCount: 2,
    dashboardReady: false,
    dirtyDayCount: 28,
    snapshotLagSeconds: 12,
    staleDeviceCount: 0,
    recoveryDevices: [],
  },
};

const metricsData = {
  kind: "organization" as const,
  slice: "metrics" as const,
  rawToolKey: "chatgpt-codex",
  toolKey: "chatgpt-codex",
  cycleView: "current_cycles" as const,
  rollingPeriod: { kind: "preset" as const, days: 30 as const },
  detail: {
    kpis: { requests: 33194, usageCost: 1267.13 },
    plans: [],
    people: [],
    quotas: [],
    modelsByDeveloper: [],
    toolKey: "chatgpt-codex",
    name: "ChatGPT / Codex",
    shortName: "ChatGPT",
    provider: "openai",
    product: "codex",
    toolName: "codex",
    aliases: [],
    sourceUrl: "https://chatgpt.com/pricing/",
  },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ToolDetailClientScreen simulated period refetch", () => {
  it("keeps the sync panel stable while metrics refresh for a new period", async () => {
    mocks.useAppQuery.mockReturnValue({
      data: shellData,
      isPending: false,
      error: null,
      refetch: vi.fn(),
    });
    mocks.useAppPageQuery.mockReturnValue({
      data: metricsData,
      isPending: false,
      isFetching: true,
      isPlaceholderData: true,
      error: null,
      refetch: vi.fn(),
    });

    const { default: ToolDetailClientScreen } = await import(
      "@/components/tools/tool-detail-client-screen"
    );
    render(<ToolDetailClientScreen />);

    expect(screen.getByTestId("sync-panel")).toHaveTextContent("dirty=28 ready=no");
    expect(screen.getByLabelText("Loading period")).toBeTruthy();
    expect(screen.queryByTestId("tool-metrics")).toBeNull();
    expect(mocks.useAppQuery).toHaveBeenCalledWith(
      ["app", "tools", "chatgpt-codex", "shell"],
      "/api/app/tools/chatgpt-codex?slice=shell",
      expect.objectContaining({ staleTime: 5 * 60 * 1000 }),
    );
    expect(mocks.useAppPageQuery).toHaveBeenCalledWith(
      ["app", "tools", "chatgpt-codex", "metrics", "view=current_cycles&days=30"],
      "/api/app/tools/chatgpt-codex?view=current_cycles&days=30&slice=metrics",
    );
  });

  it("renders metrics after shell and metrics payloads settle", async () => {
    mocks.useAppQuery.mockReturnValue({
      data: shellData,
      isPending: false,
      error: null,
      refetch: vi.fn(),
    });
    mocks.useAppPageQuery.mockReturnValue({
      data: metricsData,
      isPending: false,
      isFetching: false,
      isPlaceholderData: false,
      error: null,
      refetch: vi.fn(),
    });

    const { default: ToolDetailClientScreen } = await import(
      "@/components/tools/tool-detail-client-screen"
    );
    render(<ToolDetailClientScreen />);

    expect(screen.getByTestId("sync-panel")).toHaveTextContent("dirty=28");
    expect(screen.getByTestId("tool-metrics")).toHaveTextContent("requests=33194");
    expect(screen.queryByLabelText("Loading period")).toBeNull();
  });
});
