// @vitest-environment happy-dom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OrganizationRole } from "@/lib/rbac/permissions";
import { workspaceContextKey } from "@/lib/app-pages/query-keys";

const mocks = vi.hoisted(() => ({
  useAppQuery: vi.fn(),
  replace: vi.fn(),
  invalidateQueries: vi.fn(),
}));

vi.mock("next-auth/react", () => ({
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
  useSession: () => ({
    data: { user: { id: "user-1", name: "User", email: "user@example.test", orgId: "org-1" } },
    status: "authenticated",
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace }),
  usePathname: () => "/dashboard",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/api/client", () => ({
  useAppQuery: mocks.useAppQuery,
}));

vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-query")>("@tanstack/react-query");
  return {
    ...actual,
    useQueryClient: () => ({
      clear: vi.fn(),
      invalidateQueries: mocks.invalidateQueries,
    }),
  };
});

vi.mock("@/components/workspace-shell", () => ({
  WorkspaceShell: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="workspace-shell">{children}</div>
  ),
}));

type WorkspaceContextData = {
  organizations: Array<{ id: string; name: string; color: string | null; role: OrganizationRole }>;
  current: {
    id: string;
    name: string;
    color: string | null;
    role: OrganizationRole;
    onboardingCompleted: boolean;
  } | null;
  billing: null;
  sync: {
    deviceCount: number;
    toolCount: number;
    lastSeenAt: string | null;
    lastUsageSyncAt: string | null;
    lastAccountSyncAt: string | null;
    watermark: string;
  };
  sessionWorkspaceSyncRequired: boolean;
};

function mockWorkspaceContext(data: WorkspaceContextData | undefined) {
  mocks.useAppQuery.mockImplementation((queryKey: readonly unknown[], _url: string, options?: { refetchInterval?: unknown }) => {
    void options;
    if (queryKey[0] === "app" && queryKey[1] === "workspace-context") {
      return { data, error: null, refetch: vi.fn() };
    }
    return { data: undefined, error: null, refetch: vi.fn() };
  });
}

async function renderLayout() {
  const { WorkspaceClientLayout } = await import("@/components/workspace-client-layout");
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <WorkspaceClientLayout><div>Dashboard screen</div></WorkspaceClientLayout>
    </QueryClientProvider>,
  );
}

const readyContext = (watermark: string, overrides: Partial<WorkspaceContextData["sync"]> = {}): WorkspaceContextData => ({
  organizations: [{ id: "org-1", name: "Org", color: null, role: "owner" }],
  current: {
    id: "org-1",
    name: "Org",
    color: null,
    role: "owner",
    onboardingCompleted: true,
  },
  billing: null,
  sync: {
    deviceCount: 1,
    toolCount: 2,
    lastSeenAt: "2026-07-21T12:00:00.000Z",
    lastUsageSyncAt: "2026-07-21T12:05:00.000Z",
    lastAccountSyncAt: null,
    watermark,
    ...overrides,
  },
  sessionWorkspaceSyncRequired: false,
});

describe("WorkspaceClientLayout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockWorkspaceContext(undefined);
  });

  it("renders the shell from workspace context without a layout page-data prefetch", async () => {
    mockWorkspaceContext(readyContext("1|2|seen|usage|"));

    await renderLayout();

    expect(screen.getByTestId("workspace-shell")).toBeTruthy();
    expect(screen.getByText("Dashboard screen")).toBeTruthy();
    expect(mocks.useAppQuery).toHaveBeenCalledTimes(1);
    expect(mocks.useAppQuery).toHaveBeenCalledWith(
      workspaceContextKey,
      "/api/app/workspace-context",
      expect.objectContaining({ refetchInterval: expect.any(Function) }),
    );
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("redirects to onboarding when the user has no workspace", async () => {
    mockWorkspaceContext({
      organizations: [],
      current: null,
      billing: null,
      sync: {
        deviceCount: 0,
        toolCount: 0,
        lastSeenAt: null,
        lastUsageSyncAt: null,
        lastAccountSyncAt: null,
        watermark: "0|0|||",
      },
      sessionWorkspaceSyncRequired: false,
    });

    await renderLayout();

    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith("/onboarding");
    });
    expect(mocks.useAppQuery).toHaveBeenCalledTimes(1);
  });

  it("redirects to onboarding when workspace onboarding is incomplete", async () => {
    mockWorkspaceContext({
      organizations: [{ id: "org-1", name: "Org", color: null, role: "owner" }],
      current: {
        id: "org-1",
        name: "Org",
        color: null,
        role: "owner",
        onboardingCompleted: false,
      },
      billing: null,
      sync: {
        deviceCount: 0,
        toolCount: 0,
        lastSeenAt: null,
        lastUsageSyncAt: null,
        lastAccountSyncAt: null,
        watermark: "0|0|||",
      },
      sessionWorkspaceSyncRequired: false,
    });

    await renderLayout();

    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith("/onboarding");
    });
    expect(mocks.useAppQuery).toHaveBeenCalledTimes(1);
  });

  it("invalidates app queries when the sync watermark advances", async () => {
    let sync = readyContext("1|0|seen||", {
      toolCount: 0,
      lastUsageSyncAt: null,
    });
    mocks.useAppQuery.mockImplementation((queryKey: readonly unknown[]) => {
      if (queryKey[0] === "app" && queryKey[1] === "workspace-context") {
        return { data: sync, error: null, refetch: vi.fn() };
      }
      return { data: undefined, error: null, refetch: vi.fn() };
    });

    const { WorkspaceClientLayout } = await import("@/components/workspace-client-layout");
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = render(
      <QueryClientProvider client={queryClient}>
        <WorkspaceClientLayout><div>Dashboard screen</div></WorkspaceClientLayout>
      </QueryClientProvider>,
    );

    expect(mocks.invalidateQueries).not.toHaveBeenCalled();

    sync = readyContext("1|3|seen|usage|", {
      toolCount: 3,
      lastUsageSyncAt: "2026-07-21T12:05:00.000Z",
    });
    view.rerender(
      <QueryClientProvider client={queryClient}>
        <WorkspaceClientLayout><div>Dashboard screen</div></WorkspaceClientLayout>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["app"] });
    });
  });
});
