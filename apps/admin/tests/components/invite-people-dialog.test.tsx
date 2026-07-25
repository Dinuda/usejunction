// @vitest-environment happy-dom

import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import type { OrgBillingStatus } from "@/lib/saas-billing/status";
import { workspaceContextKey } from "@/lib/app-pages/query-keys";
import "../setup/component";

const mocks = vi.hoisted(() => ({
  useAppQuery: vi.fn(),
  invalidateAppData: vi.fn(),
  refresh: vi.fn(),
  openCheckout: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

vi.mock("next/image", () => ({
  default: (props: { alt?: string }) => <img alt={props.alt ?? ""} />,
}));

vi.mock("@/lib/api/client", () => ({
  useAppQuery: mocks.useAppQuery,
  useInvalidateAppData: () => mocks.invalidateAppData,
}));

vi.mock("@/components/saas-billing/use-billing-navigation", () => ({
  useBillingNavigation: () => ({
    error: null,
    loading: false,
    openCheckout: mocks.openCheckout,
    openPortal: vi.fn(),
    pendingDestination: null,
  }),
}));

vi.mock("@/components/onboarding/device-connect-card", () => ({
  DeviceConnectCard: () => null,
}));

vi.mock("@/components/onboarding/invite-team-form", () => ({
  InviteTeamForm: () => <div data-testid="invite-team-form">Invite form</div>,
}));

const atLimitBilling: OrgBillingStatus = {
  plan: "community",
  effectivePlan: "community",
  planLabel: "Community",
  subscriptionStatus: null,
  usersUsed: 5,
  usersLimit: 5,
  usagePercent: 100,
  canUpgrade: true,
  canManage: false,
  isAtUserLimit: true,
  billingSeatQuantity: null,
  seatSyncPending: false,
};

const teamBilling: OrgBillingStatus = {
  ...atLimitBilling,
  plan: "team",
  effectivePlan: "team",
  planLabel: "Team",
  usersLimit: null,
  usagePercent: null,
  canUpgrade: false,
  canManage: true,
  isAtUserLimit: false,
  billingSeatQuantity: 5,
};

beforeEach(() => {
  vi.clearAllMocks();
});

test("at user limit shows upgrade state instead of invite form", async () => {
  mocks.useAppQuery.mockImplementation((key: readonly unknown[]) => {
    if (key[0] === "app" && key[1] === "workspace-context") {
      return { data: { billing: atLimitBilling } };
    }
    return { data: undefined };
  });

  const { InvitePeopleDialog } = await import("@/components/team/team-connect-panel");
  render(<InvitePeopleDialog />);

  fireEvent.click(screen.getByRole("button", { name: /Invite teammates/i }));

  expect(screen.getByText(/Community includes up to 5 users/i)).toBeTruthy();
  expect(screen.queryByText("5 / 5 users")).toBeNull();
  expect(screen.getByRole("button", { name: /Upgrade to Team/i })).toBeTruthy();
  expect(screen.queryByTestId("invite-team-form")).toBeNull();
});

test("under limit or on Team shows invite form", async () => {
  mocks.useAppQuery.mockImplementation((key: readonly unknown[]) => {
    if (key[0] === "app" && key[1] === "workspace-context") {
      return { data: { billing: teamBilling } };
    }
    return { data: undefined };
  });

  const { InvitePeopleDialog } = await import("@/components/team/team-connect-panel");
  render(<InvitePeopleDialog />);

  fireEvent.click(screen.getByRole("button", { name: /Invite teammates/i }));

  expect(screen.getByTestId("invite-team-form")).toBeTruthy();
  expect(screen.queryByRole("button", { name: /Upgrade to Team/i })).toBeNull();
});

test("reads billing from workspace context query key", async () => {
  mocks.useAppQuery.mockReturnValue({ data: { billing: atLimitBilling } });

  const { InvitePeopleDialog } = await import("@/components/team/team-connect-panel");
  render(<InvitePeopleDialog />);

  expect(mocks.useAppQuery.mock.calls[0][0]).toEqual(workspaceContextKey);
});
