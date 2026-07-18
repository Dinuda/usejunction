import assert from "node:assert/strict";
import { test } from "vitest";
import type { WorkActivitySession } from "@/lib/signals/queries/get-work-activity";
import {
  WORK_SESSION_CSV_HEADERS,
  rowsToCsv,
  workActivitySessionsToCsvRows,
  workSessionsToCsv,
} from "@/lib/signals/work-export";

test("rowsToCsv escapes commas and quotes", () => {
  const csv = rowsToCsv(["a", "b"], [{ a: 'hello, "world"', b: "plain" }]);
  assert.equal(csv, 'a,b\n"hello, ""world""",plain\n');
});

test("workSessionsToCsv flattens activity sessions", () => {
  const sessions: WorkActivitySession[] = [
    {
      id: "sess_1",
      person: "Dinuda",
      email: "d@example.com",
      toolName: "Cursor",
      model: "gpt-5",
      mode: "agent",
      title: "Member redesign",
      tldr: "Hub tabs for work",
      overview: null,
      observedAt: "2026-07-17T12:00:00.000Z",
      source: "cursor",
      toolCallCounts: { Read: 3, Shell: 1 },
      trace: {
        approach: "agent",
        location: { project: "usejunction" },
        skills: ["canvas"],
        tools: ["Read", "Shell"],
        files: ["page.tsx"],
        durationSeconds: 120,
        stats: { linesAdded: 10, linesRemoved: 2, filesChanged: 1 },
        understanding: {
          version: 1,
          intent: "redesign work tab",
          outcome: { status: "committed" },
        },
      },
    },
  ];

  const rows = workActivitySessionsToCsvRows(sessions);
  assert.equal(rows[0]?.title, "Member redesign");
  assert.equal(rows[0]?.location, "usejunction");
  assert.equal(rows[0]?.durationSeconds, "120");
  assert.equal(rows[0]?.outcome, "committed");
  assert.match(rows[0]?.tools ?? "", /Read/);

  const csv = workSessionsToCsv(sessions);
  const headerLine = csv.split("\n")[0] ?? "";
  assert.equal(headerLine, WORK_SESSION_CSV_HEADERS.join(","));
  assert.match(csv, /Member redesign/);
});
