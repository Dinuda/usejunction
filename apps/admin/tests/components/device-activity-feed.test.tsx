// @vitest-environment happy-dom

import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import "../setup/component";

vi.mock("@/components/signals/signals-ui", () => ({
  SignalsSectionHeader: ({
    title,
    description,
    action,
  }: {
    title: string;
    description?: string;
    action?: React.ReactNode;
  }) => (
    <div>
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}
      {action}
    </div>
  ),
}));

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

import { DeviceActivityFeed } from "@/components/activity/device-activity-feed";
import type { DeviceActivityFeed as DeviceActivityFeedData } from "@/lib/queries/activity/device-activity-types";

const feed: DeviceActivityFeedData = {
  presenceFallback: false,
  items: [
    {
      id: "exchange:1",
      kind: "usage",
      source: "exchange",
      direction: "ingest",
      status: "ok",
      at: "2026-07-18T16:30:00.000Z",
      title: "Usage sync",
      summary: "Usage sync · 2 rows · cursor · 1.2K tokens",
      errorCode: null,
      durationMs: 42,
      device: {
        id: "d1",
        hostname: "MacBook-Pro.local",
        os: "darwin",
        architecture: "arm64",
        agentVersion: "0.0.1",
      },
      developer: { id: "dev1", name: "Ada", email: "ada@example.com" },
      details: {
        tools: ["cursor"],
        models: ["gpt-5"],
        sample: [{ date: "2026-07-18", toolName: "cursor", model: "gpt-5", requests: 2, tokens: 1200 }],
      },
      inspect: {
        requestSummary: { aggregates: 2, tools: ["cursor"], deviceToken: "[redacted]" },
        responseSummary: { upserted: 2 },
      },
    },
  ],
};

test("device activity feed expands details and inspect payload", () => {
  render(<DeviceActivityFeed feed={feed} showDeveloper />);

  expect(screen.getByText("Device activity.")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /view device activity/i }));
  expect(screen.getByText("Usage sync · 2 rows · cursor · 1.2K tokens")).toBeTruthy();

  fireEvent.click(screen.getByText("Usage sync"));
  expect(screen.getByText(/What happened/i)).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: /inspect payload/i }));
  expect(screen.getByText(/"upserted": 2/)).toBeTruthy();
  expect(screen.getByText(/"deviceToken": "\[redacted\]"/)).toBeTruthy();
});
