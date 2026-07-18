// @vitest-environment happy-dom

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { expect, test, vi, beforeEach } from "vitest";
import { PlanStatusCard } from "@/components/saas-billing/plan-status-card";
import type { OrgBillingStatus } from "@/lib/saas-billing/status";
import "../setup/component";

const upgradeBilling: OrgBillingStatus = {
  plan: "community",
  effectivePlan: "community",
  planLabel: "Community",
  trialDaysLeft: null,
  subscriptionStatus: null,
  devicesUsed: 10,
  devicesLimit: 10,
  coveragePercent: 100,
  canUpgrade: true,
  canManage: false,
  isAtDeviceLimit: true,
  developerCount: 10,
  purchasedSeats: null,
  seatsRemaining: null,
  isAtSeatCapacity: false,
  minCheckoutSeats: 10,
};

beforeEach(() => {
  vi.restoreAllMocks();
});

test("seat picker sends quantity 12 when upgrading from a 10-dev roster", async () => {
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

  fireEvent.click(screen.getByRole("button", { name: /Upgrade to Team/i }));
  const dialog = await screen.findByRole("dialog");
  const input = within(dialog).getByRole("spinbutton");
  expect(input).toHaveValue(10);

  fireEvent.change(input, { target: { value: "12" } });
  expect(within(dialog).getByText(/\$144/)).toBeTruthy();

  fireEvent.click(within(dialog).getByRole("button", { name: /Continue to checkout/i }));

  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalled();
  });

  const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  expect(init.method).toBe("POST");
  expect(JSON.parse(String(init.body))).toEqual({ quantity: 12 });
  expect(href).toBe("https://lemon.test/checkout");
});

test("checkout stays disabled when seats are below the roster floor", async () => {
  render(<PlanStatusCard billing={upgradeBilling} />);
  fireEvent.click(screen.getByRole("button", { name: /Upgrade to Team/i }));
  const dialog = await screen.findByRole("dialog");
  const input = within(dialog).getByRole("spinbutton");
  fireEvent.change(input, { target: { value: "8" } });
  expect(within(dialog).getByRole("button", { name: /Continue to checkout/i })).toBeDisabled();
});

test("Team card shows seat coverage and Add seats", () => {
  const teamBilling: OrgBillingStatus = {
    ...upgradeBilling,
    plan: "team",
    effectivePlan: "team",
    planLabel: "Team",
    devicesLimit: null,
    canUpgrade: false,
    canManage: true,
    isAtDeviceLimit: false,
    purchasedSeats: 5,
    seatsRemaining: 3,
    isAtSeatCapacity: false,
    developerCount: 2,
    minCheckoutSeats: 2,
    coveragePercent: 40,
  };

  render(<PlanStatusCard billing={teamBilling} />);
  expect(screen.getByText("2 / 5 seats")).toBeTruthy();
  expect(screen.getByRole("button", { name: /Add seats/i })).toBeTruthy();
  expect(screen.getByRole("button", { name: /Manage billing/i })).toBeTruthy();
});
