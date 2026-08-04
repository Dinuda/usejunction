import test from "node:test";
import assert from "node:assert/strict";
import { aggregateRecords, buildReport } from "../src/metrics/analyze.js";
import type { SessionRecord } from "../src/types.js";

function session(index: number, category: SessionRecord["taskCategory"] = "feature"): SessionRecord {
  return { id: `s${index}`, harness: index % 2 ? "Codex" : "Claude Code", model: "model-a", date: `2026-08-${String(index + 1).padStart(2, "0")}`, startedAt: null, endedAt: null, durationMs: 1000 + index * 100, turns: 3, iterations: 2, toolCalls: 4, failedToolCalls: index % 3 === 0 ? 1 : 0, recoveredFailures: index % 3 === 0 ? 1 : 0, inputTokens: 100, outputTokens: 50, costUsd: 0.01, repository: "project-a", taskCategory: category, testOutcome: "passed", buildOutcome: "not_measured", acceptance: "accepted", sourceKind: "session" };
}

test("aggregates sessions and keeps missing measurements absent", () => {
  const rows = aggregateRecords([session(1), { ...session(2), harness: "Codex", durationMs: null, inputTokens: null, outputTokens: null, costUsd: null, testOutcome: "not_measured" }], []);
  assert.equal(rows[0].sessions, 2);
  assert.equal(rows[0].durationMs.length, 1);
  assert.equal(rows[0].tokensPerSession.length, 1);
});

test("does not produce a false positive without repeated comparisons", () => {
  const report = buildReport(Array.from({ length: 6 }, (_, index) => session(index)), [], []);
  assert.equal(report.verdict.label, "Not useful yet");
  assert.equal(report.aggregates.some((group) => group.compositeScore !== null), false);
});
