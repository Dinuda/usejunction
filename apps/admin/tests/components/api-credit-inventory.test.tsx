// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import "../setup/component";

vi.mock("@/components/signals/signals-ui", () => ({
  SignalsSectionHeader: ({
    title,
    description,
  }: {
    title: string;
    description?: string;
  }) => (
    <div>
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}
    </div>
  ),
}));

import { ApiCreditInventory } from "@/components/tools/api-credit-inventory";

test("shows coming soon placeholder for API credits", () => {
  render(<ApiCreditInventory />);

  expect(screen.getByText("Coming soon")).toBeTruthy();
  expect(screen.getByText(/available in a later release/i)).toBeTruthy();
});
