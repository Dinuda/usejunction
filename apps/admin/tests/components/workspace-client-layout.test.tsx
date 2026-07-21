// @vitest-environment happy-dom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useAppQuery: vi.fn(),
  replace: vi.fn(),
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

vi.mock("@/components/workspace-shell", () => ({
  WorkspaceShell: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="workspace-shell">{children}</div>
  ),
}));

describe("WorkspaceClientLayout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useAppQuery.mockReturnValue({
      data: undefined,
      error: null,
      refetch: vi.fn(),
    });
  });

  it("renders the shell and starts context and page data without a bootstrap gate", async () => {
    const { WorkspaceClientLayout } = await import("@/components/workspace-client-layout");
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <WorkspaceClientLayout><div>Dashboard screen</div></WorkspaceClientLayout>
      </QueryClientProvider>,
    );

    expect(screen.getByTestId("workspace-shell")).toBeTruthy();
    expect(screen.getByText("Dashboard screen")).toBeTruthy();
    expect(mocks.useAppQuery).toHaveBeenCalledWith(
      ["app", "workspace-context"],
      "/api/app/workspace-context",
    );
    expect(mocks.useAppQuery).toHaveBeenCalledWith(
      ["app", "dashboard", ""],
      "/api/app/dashboard",
      { enabled: true },
    );
  });
});
