// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import "../setup/component";

const mocks = vi.hoisted(() => ({
  invalidateAppData: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace }),
  useSearchParams: () => new URLSearchParams("upgraded=1"),
}));

vi.mock("@/lib/api/client", () => ({
  useInvalidateAppData: () => mocks.invalidateAppData,
}));

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { href: "http://localhost/dashboard?upgraded=1" },
  });
});

test("shows updating copy while Team status is pending", async () => {
  const { SubscriptionUpgradedBanner } = await import(
    "@/components/saas-billing/subscription-upgraded-banner"
  );
  render(<SubscriptionUpgradedBanner isTeam={false} />);

  expect(screen.getByText(/Subscription updating/i)).toBeTruthy();
});

test("shows active copy when Team is confirmed", async () => {
  const { SubscriptionUpgradedBanner } = await import(
    "@/components/saas-billing/subscription-upgraded-banner"
  );
  render(<SubscriptionUpgradedBanner isTeam={true} />);

  expect(screen.getByText("Team subscription is active.")).toBeTruthy();
});
