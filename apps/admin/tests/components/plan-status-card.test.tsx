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

test("upgrade opens the in-app Team checkout page", async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);

  render(<PlanStatusCard billing={upgradeBilling} />);
  expect(screen.getByText("5 / 5 users")).toBeTruthy();
  expect(screen.queryByText(/devices?/i)).toBeNull();

  const upgrade = screen.getByRole("link", { name: /Upgrade to Team/i });
  expect(upgrade.getAttribute("href")).toBe("/settings/upgrade");
  expect(fetchMock).not.toHaveBeenCalled();
  expect(screen.queryByRole("dialog")).toBeNull();
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
  expect(screen.getByRole("link", { name: "Billing settings" }).getAttribute("href")).toBe(
    "/settings#settings-billing",
  );
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
