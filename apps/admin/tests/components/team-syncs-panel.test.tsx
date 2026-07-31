// @vitest-environment happy-dom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import "../setup/component";

vi.mock("@/components/signals/signals-ui", () => ({
  SignalsKpi: ({
    label,
    value,
    sub,
  }: {
    label: string;
    value: React.ReactNode;
    sub?: React.ReactNode;
  }) => (
    <div>
      <p>{label}</p>
      <p>{value}</p>
      {sub ? <p>{sub}</p> : null}
    </div>
  ),
}));

vi.mock("@/components/dashboard/local-sync-panel", () => ({
  LocalSyncPanel: ({ scope }: { scope: "team" | "you" }) => <div>sync panel {scope}</div>,
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

import { TeamSyncsPanel } from "@/components/team/team-syncs-panel";
import type { OrgDeviceSyncStatus } from "@/lib/queries/team/device-syncs";

const syncs: OrgDeviceSyncStatus = {
  totals: { total: 2, online: 1, stale: 1, neverSynced: 0 },
  devices: [
    {
      id: "d1",
      hostname: "macbook-pro",
      os: "darwin",
      architecture: "arm64",
      agentVersion: "0.3.4",
      lastSeenAt: "2026-07-25T11:50:00.000Z",
      lastUsageSyncAt: "2026-07-25T11:40:00.000Z",
      lastAccountSyncAt: "2026-07-25T11:40:00.000Z",
      lastToolsSyncAt: "2026-07-25T11:40:00.000Z",
      lastQuotasSyncAt: null,
      hasLocalEndpoint: true,
      remoteSyncProtocol: 1,
      status: "online",
      latestRequest: { id: "req-1", status: "succeeded", createdAt: "2026-07-25T11:45:00.000Z", completedAt: "2026-07-25T11:46:00.000Z" },
      developer: { id: "dev-1", name: "Ada Lovelace", email: "ada@example.test" },
    },
    {
      id: "d2",
      hostname: "desk-linux",
      os: "linux",
      architecture: "x64",
      agentVersion: "0.3.2",
      lastSeenAt: "2026-07-24T10:00:00.000Z",
      lastUsageSyncAt: "2026-07-24T09:00:00.000Z",
      lastAccountSyncAt: null,
      lastToolsSyncAt: null,
      lastQuotasSyncAt: null,
      hasLocalEndpoint: false,
      remoteSyncProtocol: 0,
      status: "stale",
      latestRequest: { id: "req-1", status: "queued", createdAt: "2026-07-25T11:45:00.000Z", completedAt: null },
      developer: { id: "dev-2", name: "Bob Builder", email: "bob@example.test" },
    },
  ],
};

describe("TeamSyncsPanel", () => {
  it("filters by hostname and links to the member profile", () => {
    render(<TeamSyncsPanel syncs={syncs} />);

    expect(screen.getAllByText("macbook-pro").length).toBeGreaterThan(0);
    expect(screen.getAllByText("desk-linux").length).toBeGreaterThan(0);

    fireEvent.change(screen.getByLabelText("Filter machines"), { target: { value: "macbook" } });
    expect(screen.getAllByText("macbook-pro").length).toBeGreaterThan(0);
    expect(screen.queryByText("desk-linux")).toBeNull();

    const profileLinks = screen.getAllByRole("link").filter((link) => link.getAttribute("href") === "/team/dev-1");
    expect(profileLinks.length).toBeGreaterThan(0);
  });

  it("filters by sync status", async () => {
    const { userEvent } = await import("@testing-library/user-event");
    const user = userEvent.setup();
    render(<TeamSyncsPanel syncs={syncs} />);

    await user.click(screen.getByLabelText("Filter by sync status"));
    await user.click(await screen.findByRole("option", { name: "Stale" }));

    expect(screen.getAllByText("desk-linux").length).toBeGreaterThan(0);
    expect(screen.queryByText("macbook-pro")).toBeNull();
  });
});
