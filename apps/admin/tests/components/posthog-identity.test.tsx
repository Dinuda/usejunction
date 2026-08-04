// @vitest-environment happy-dom

import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  identify: vi.fn(),
  group: vi.fn(),
  reset: vi.fn(),
  session: {
    data: {
      user: {
        id: "user-1",
        email: "person@example.test",
        name: "Test Person",
        orgId: "org-1",
        role: "owner",
      },
    },
    status: "authenticated",
  } as { data: Record<string, unknown> | null; status: string },
}));

vi.mock("next-auth/react", () => ({
  useSession: () => mocks.session,
}));

vi.mock("posthog-js", () => ({
  default: {
    identify: mocks.identify,
    group: mocks.group,
    reset: mocks.reset,
  },
}));

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN", "phc_test");
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://us.i.posthog.com");
  mocks.session = {
    data: {
      user: {
        id: "user-1",
        email: "person@example.test",
        name: "Test Person",
        orgId: "org-1",
        role: "owner",
      },
    },
    status: "authenticated",
  };
});

afterEach(() => {
  vi.unstubAllEnvs();
});

test("identifies signed-in users, groups their organization, and resets on logout", async () => {
  const { PostHogIdentity } = await import("@/components/posthog-identity");
  const view = render(<PostHogIdentity />);

  await waitFor(() => {
    expect(mocks.identify).toHaveBeenCalledWith("user-1", {
      email: "person@example.test",
      name: "Test Person",
      organization_id: "org-1",
      organization_role: "owner",
    });
  });
  expect(mocks.group).toHaveBeenCalledWith("organization", "org-1");

  mocks.session = { data: null, status: "unauthenticated" };
  view.rerender(<PostHogIdentity />);

  await waitFor(() => {
    expect(mocks.reset).toHaveBeenCalledTimes(1);
  });
});
