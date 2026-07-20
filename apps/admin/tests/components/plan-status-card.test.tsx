// @vitest-environment happy-dom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, test, vi, beforeEach } from "vitest";
import {
  ActivePlanBadge,
  PlanStatusCard,
  shouldShowSidebarPlanCard,
} from "@/components/saas-billing/plan-status-card";
import type { OrgBillingStatus } from "@/lib/saas-billing/status";
import "../setup/component";

const upgradeBilling: OrgBillingStatus = {
  plan: "community",
  effectivePlan: "community",
  planLabel: "Community",
  trialDaysLeft: null,
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

beforeEach(() => {
  vi.restoreAllMocks();
});

test("upgrade opens checkout directly without an intermediate dialog", async () => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ url: "https://lemon.test/checkout" }),
  });
  vi.stubGlobal("fetch", fetchMock);
  let href = "http://localhost/dashboard";
  Object.defineProperty(window, "location", {
    configurable: true,
    value: {
      get href() {
        return href;
      },
      set href(next: string) {
        href = next;
      },
    },
  });

  render(<PlanStatusCard billing={upgradeBilling} />);
  expect(screen.getByText("5 / 5 users")).toBeTruthy();
  expect(screen.queryByText(/devices?/i)).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: /Upgrade to Team/i }));

  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalled();
  });

  const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  expect(init.method).toBe("POST");
  expect(JSON.parse(String(init.body))).toEqual({});
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(href).toBe("https://lemon.test/checkout");
});

test("Team card shows organization coverage and billing management", () => {
  const teamBilling: OrgBillingStatus = {
    ...upgradeBilling,
    plan: "team",
    effectivePlan: "team",
    planLabel: "Team",
    usersLimit: null,
    canUpgrade: false,
    canManage: true,
    isAtUserLimit: false,
    billingSeatQuantity: 2,
    seatSyncPending: false,
    usersUsed: 2,
    usagePercent: null,
  };

  render(<PlanStatusCard billing={teamBilling} />);
  expect(screen.getByText("2 active users")).toBeTruthy();
  expect(screen.queryByRole("button", { name: /Add seats/i })).toBeNull();
  expect(screen.getByRole("button", { name: /Manage billing/i })).toBeTruthy();
});

test("active paid plans use a compact footer badge", () => {
  const teamBilling: OrgBillingStatus = {
    ...upgradeBilling,
    plan: "team",
    effectivePlan: "team",
    planLabel: "Team",
    subscriptionStatus: "active",
    usersLimit: null,
    canUpgrade: false,
    canManage: true,
    isAtUserLimit: false,
    billingSeatQuantity: 2,
    usersUsed: 2,
    usagePercent: null,
  };

  expect(shouldShowSidebarPlanCard(teamBilling)).toBe(false);
  expect(shouldShowSidebarPlanCard({ ...teamBilling, subscriptionStatus: "on_trial" })).toBe(false);
  expect(shouldShowSidebarPlanCard({ ...teamBilling, subscriptionStatus: "cancelled" })).toBe(true);
  expect(shouldShowSidebarPlanCard(upgradeBilling)).toBe(true);

  render(<ActivePlanBadge billing={teamBilling} />);
  expect(screen.getByText("Team plan")).toBeTruthy();
  expect(screen.getByLabelText("Current plan: Team")).toBeTruthy();
});

test("Team card surfaces a confirmed quantity mismatch", () => {
  render(<PlanStatusCard billing={{
    ...upgradeBilling,
    plan: "team",
    effectivePlan: "team",
    planLabel: "Team",
    subscriptionStatus: "active",
    usersLimit: null,
    canUpgrade: false,
    canManage: true,
    usersUsed: 3,
    billingSeatQuantity: 2,
    seatSyncPending: true,
    usagePercent: null,
  }} />);
  expect(screen.getByText(/Billing sync pending/i)).toBeTruthy();
});
