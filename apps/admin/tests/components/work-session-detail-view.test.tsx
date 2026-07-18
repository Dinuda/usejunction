// @vitest-environment happy-dom

import { render, screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { WorkSessionDetailView } from "@/components/signals/work-session-detail-view";
import type { WorkSessionDetail } from "@/lib/signals/queries/get-work-session-detail";
import "../setup/component";

vi.mock("@/components/tools/tool-brand-icon", () => ({
  ToolLogoTile: ({ tool }: { tool: string }) => <span aria-label={`${tool} logo`} />,
}));

vi.mock("@/components/signals/work-csv-export-button", () => ({
  WorkCsvExportButton: () => <button type="button">Export CSV</button>,
}));

const session: WorkSessionDetail = {
  id: "cmrp0gfon00019ki06v8h7459",
  localId: "local-abc",
  toolName: "cursor",
  model: "agent",
  mode: "agent",
  title: "AI work extraction setting",
  tldr: "AI work extraction setting",
  overview: null,
  startedAt: "2026-07-17T16:30:00.000Z",
  endedAt: "2026-07-18T16:24:00.000Z",
  observedAt: "2026-07-18T16:30:00.000Z",
  source: "cursor",
  toolCallCounts: { Read: 137, Grep: 59, Shell: 22 },
  repository: { host: "github.com", owner: "acme", name: "usejunction" },
  locationLabel: "acme/usejunction",
  developer: { id: "dev1", name: "Dinuda Yaggahavita", email: "d@example.com" },
  device: { id: "devc1", hostname: "MacBook-Pro.local" },
  trace: {
    approach: "agent",
    durationSeconds: 86040,
    phaseFingerprint: "plan>explore>edit>verify",
    languages: ["typescript", "go"],
    testInvolved: true,
    tools: ["Task", "GetMcpTools", "CallMcpTool", "Grep", "Read"],
    files: ["contracts.ts", "schema.prisma", "scan.go"],
    steps: [{ kind: "tool", name: "Read" }],
    understanding: {
      version: 1,
      intent: "AI work extraction setting",
      intentSource: "title",
      outcome: { status: "verified", evidence: ["verified_after_edit"] },
      acceptance: { status: "likely_kept", signals: ["verified_after_edit"] },
      authorship: { aiShare: 0.72, aiEditEvents: 40, humanEditEvents: 10 },
      attempts: { score: 7, signals: ["rewrite_loop", "reprompt"] },
      context: { kinds: ["repo", "files"], primaryFiles: ["contracts.ts"] },
      sequence: { userTurns: 17, assistantTurns: 119, toolCalls: 390 },
      confidence: { intent: 0.8, authorship: 0.7, acceptance: 0.6, outcome: 0.7 },
    },
    userTurns: [
      {
        text: "Can we add another setting to extract what is actually being done from these local AI tools?",
        at: "2026-07-17T16:35:00.000Z",
      },
      {
        text: [
          "Implement the plan as specified. Do not edit the plan file itself.",
          "Mark todos as in_progress. Do not regurgitate or reiterate its result unless asked.",
          "Always follow these steps carefully. Never skip hooks. End your response with a brief confirmation.",
          "Critical: you must not create commits unless asked. Important: stay on task.",
        ].join(" "),
      },
    ],
    fileChangelog: [
      { file: "contracts.ts", op: "edit", source: "composer", events: 5 },
      { file: "schema.prisma", op: "edit", source: "tool", events: 3 },
      { file: "activity-settings-card.tsx", op: "create", source: "composer", events: 1 },
      ...Array.from({ length: 12 }, (_, i) => ({
        file: `extra-${i}.ts`,
        op: "edit" as const,
        source: "tool" as const,
        events: 1,
      })),
    ],
    changeNarrative: {
      text: [
        "Updated work extraction so managers can see what actually landed.",
        "",
        "### Extraction",
        "Raw markdown headers should not render.",
        "",
        "- Added a clipped changeNarrative field from assistant wrap-ups",
        "- Surfaced narrative above the file changelog on the detail page",
      ].join("\n"),
      source: "assistant_final",
      bullets: [
        "Added a clipped changeNarrative field from assistant wrap-ups",
        "Surfaced narrative above the file changelog on the detail page",
      ],
    },
  },
};

test("shows ask timeline with changed files in a side panel", () => {
  const { container } = render(<WorkSessionDetailView session={session} />);

  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
    "AI work extraction setting",
  );

  expect(screen.getByRole("heading", { name: "Asked." })).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Changed" })).toBeTruthy();

  const kpiStrip = container.querySelector(".mt-10.grid.gap-8") as HTMLElement;
  expect(kpiStrip).toBeTruthy();
  expect(kpiStrip.textContent).toContain("Time");
  expect(kpiStrip.textContent).toContain("23h 54m");
  expect(kpiStrip.textContent).toContain("Files");
  expect(kpiStrip.textContent).toContain("15 files");
  expect(kpiStrip.textContent).toContain("Outcome");
  expect(kpiStrip.textContent).toContain("Verified");
  expect(kpiStrip.textContent).toContain("72%");

  expect(screen.getByText(/Can we add another setting/)).toBeTruthy();
  expect(screen.getByText(/1 setup message/)).toBeTruthy();

  expect(screen.queryByText(/### Extraction/)).toBeNull();
  expect(
    screen.queryByText(/Added a clipped changeNarrative field from assistant wrap-ups/),
  ).toBeNull();
  expect(
    screen.getByText(/Updated work extraction so managers can see what actually landed/),
  ).toBeTruthy();

  expect(screen.getAllByText("contracts.ts").length).toBeGreaterThanOrEqual(1);
  expect(screen.getAllByText("Edited · AI").length).toBeGreaterThanOrEqual(1);
  expect(screen.getByText("Created · AI")).toBeTruthy();
  expect(screen.queryByText(/· Tool/)).toBeNull();

  const aside = screen.getByRole("heading", { name: "Changed" }).closest("aside");
  expect(aside).toBeTruthy();
  expect(within(aside as HTMLElement).getByText("15")).toBeTruthy();

  const details = screen.getByText("Session details.").closest("details") as HTMLDetailsElement;
  expect(details.open).toBe(false);
  expect(within(details).getByText("GetMcpTools")).toBeTruthy();
  expect(within(details).getByText("local-abc")).toBeTruthy();
});

test("skips research essays and just lists files", () => {
  const essay: WorkSessionDetail = {
    ...session,
    trace: {
      ...session.trace!,
      changeNarrative: {
        text: [
          "Current metrics (tools, files touched, approach, repo, cadence) are useful for coaching,",
          "but big gaps remain around outcomes and intent.",
          "",
          "- Accepted vs rejected AI edits (kept / reverted / partially kept)",
          "- Final code that landed (post-commit), not intermediate chat drafts",
          "- Intent labels (bugfix / feature / refactor / test / docs) from PRs/Issues, not prompts",
          "- Domain tags (repo/service/language/framework)",
          "- Style/standards signals (lint/format rules, internal API naming patterns)",
        ].join("\n"),
        source: "assistant_final",
        bullets: [
          "Accepted vs rejected AI edits (kept / reverted / partially kept)",
          "Final code that landed (post-commit), not intermediate chat drafts",
          "Intent labels (bugfix / feature / refactor / test / docs) from PRs/Issues, not prompts",
          "Domain tags (repo/service/language/framework)",
          "Style/standards signals (lint/format rules, internal API naming patterns)",
        ],
      },
    },
  };

  render(<WorkSessionDetailView session={essay} />);
  expect(screen.queryByText(/useful for coaching/)).toBeNull();
  expect(screen.queryByText(/Accepted vs rejected AI edits/)).toBeNull();
  expect(screen.getAllByText("contracts.ts").length).toBeGreaterThanOrEqual(1);
  expect(screen.getByText(/Can we add another setting/)).toBeTruthy();
});

test("reads are tucked behind writes in the file list", () => {
  const mixed: WorkSessionDetail = {
    ...session,
    trace: {
      ...session.trace!,
      changeNarrative: undefined,
      userTurns: [
        {
          text: "Fix the detail page",
          files: [
            { file: "page.tsx", op: "read", source: "tool", events: 1 },
            { file: "view.tsx", op: "edit", source: "composer", events: 2 },
            { file: "helpers.ts", op: "read", source: "tool", events: 1 },
          ],
        },
      ],
      fileChangelog: [
        { file: "page.tsx", op: "read", source: "tool", events: 1 },
        { file: "view.tsx", op: "edit", source: "composer", events: 2 },
        { file: "helpers.ts", op: "read", source: "tool", events: 1 },
      ],
    },
  };

  render(<WorkSessionDetailView session={mixed} />);
  expect(screen.getByText("Fix the detail page")).toBeTruthy();
  expect(screen.getByText("view.tsx")).toBeTruthy();
  expect(screen.getByText(/Also read 2/)).toBeTruthy();
  expect(screen.queryByText(/· Tool/)).toBeNull();
  expect(screen.getByText("Edited · AI")).toBeTruthy();
  expect(screen.getAllByText("Read").length).toBeGreaterThanOrEqual(1);
});

test("consolidates turn files and changelog without duplicates", () => {
  const withTurnFiles: WorkSessionDetail = {
    ...session,
    trace: {
      ...session.trace!,
      changeNarrative: undefined,
      understanding: {
        ...session.trace!.understanding!,
        intent: undefined,
        confidence: { intent: 0.2 },
      },
      userTurns: [
        {
          text: "Add the extraction setting",
          at: "2026-07-17T16:35:00.000Z",
          files: [
            { file: "contracts.ts", op: "edit", source: "composer", events: 5 },
            { file: "schema.prisma", op: "edit", source: "tool", events: 3 },
          ],
        },
        {
          text: "Also wire the UI card",
          files: [{ file: "activity-settings-card.tsx", op: "create", source: "composer", events: 1 }],
        },
      ],
      fileChangelog: [
        { file: "contracts.ts", op: "edit", source: "composer", events: 5 },
        { file: "schema.prisma", op: "edit", source: "tool", events: 3 },
        { file: "activity-settings-card.tsx", op: "create", source: "composer", events: 1 },
        { file: "orphan.ts", op: "edit", source: "tool", events: 1 },
      ],
    },
  };

  render(<WorkSessionDetailView session={withTurnFiles} />);

  expect(screen.getByText("Add the extraction setting")).toBeTruthy();
  expect(screen.getByText("Also wire the UI card")).toBeTruthy();
  expect(screen.getAllByText("contracts.ts").length).toBeGreaterThanOrEqual(1);
  expect(screen.getAllByText("orphan.ts").length).toBeGreaterThanOrEqual(1);
  expect(screen.queryByText(/setup message/)).toBeNull();
});

test("session details contain raw engineering tokens for power users", () => {
  render(<WorkSessionDetailView session={session} />);
  const details = screen.getByText("Session details.").closest("details") as HTMLDetailsElement;
  expect(within(details).getByText("rewrite_loop · reprompt")).toBeTruthy();
  expect(within(details).getByText("MacBook-Pro.local")).toBeTruthy();
});
