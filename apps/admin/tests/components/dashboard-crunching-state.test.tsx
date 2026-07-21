// @vitest-environment happy-dom

import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { DashboardCrunchingState } from "@/components/dashboard/dashboard-crunching-state";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

test("crunching copy stays hidden until the reveal delay elapses", async () => {
  vi.useFakeTimers();
  render(<DashboardCrunchingState revealAfterMs={1500} />);

  assert.equal(screen.queryByText("Crunching your numbers."), null);

  await act(async () => {
    await vi.advanceTimersByTimeAsync(1499);
  });
  assert.equal(screen.queryByText("Crunching your numbers."), null);

  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
  assert.ok(screen.getByText("Crunching your numbers."));
});
