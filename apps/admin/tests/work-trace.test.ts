import assert from "node:assert/strict";
import { test } from "vitest";
import {
  formatFileChangeHint,
  formatHumanPhases,
  formatThreadHint,
  formatTraceLocation,
  formatUnderstandingSummary,
  humanizeAcceptanceStatus,
  humanizeEvidenceToken,
  humanizeFileOp,
  humanizeOutcomeStatus,
  interleaveByTool,
  looksLikeSystemInstruction,
  parseWorkTrace,
  pickHeroUserTurnIndex,
  resolveChangeNarrative,
  changeNarrativeHeadline,
} from "../lib/signals/work-trace";

test("parseWorkTrace keeps structured fields only", () => {
  const trace = parseWorkTrace({
    approach: "agent",
    location: { project: "usejunction", repository: { host: "github.com", owner: "acme", name: "usejunction" } },
    skills: ["canvas", ""],
    tools: ["Read", "Shell"],
    files: ["a.ts"],
    stats: { linesAdded: 3 },
    durationSeconds: 90,
    phases: ["explore", "edit"],
    phaseFingerprint: "explore>edit",
    churn: { filesRewritten: 1, rewriteEvents: 2 },
    verify: { afterEdit: true, kinds: ["lint"] },
    languages: ["typescript"],
    testInvolved: true,
    skillCounts: { canvas: 2 },
    git: { branch: "main", committed: true, commits: [{ sha: "abc1234", subject: "hi" }] },
    understanding: {
      version: 1,
      intent: "Add episode understanding",
      intentSource: "title",
      outcome: { status: "verified", evidence: ["verified_after_edit"] },
      authorship: { aiShare: 0.75 },
      confidence: { intent: 0.7, authorship: 0.85, outcome: 0.6 },
    },
    userTurns: [{
      text: "Please add user turns",
      at: "2026-07-17T10:00:00.000Z",
      files: [{ file: "a.ts", op: "edit", source: "tool", events: 2 }],
    }],
    fileChangelog: [{ file: "a.ts", op: "edit", source: "tool", events: 2 }],
    changeNarrative: {
      text: "Updated a.ts to capture user turns.",
      source: "assistant_final",
      bullets: ["Capture user turns"],
    },
  });
  assert.ok(trace);
  assert.equal(trace?.approach, "agent");
  assert.deepEqual(trace?.skills, ["canvas"]);
  assert.equal(formatTraceLocation(trace), "acme/usejunction");
  assert.equal(trace?.durationSeconds, 90);
  assert.equal(trace?.phaseFingerprint, "explore>edit");
  assert.equal(trace?.git?.branch, "main");
  assert.equal(trace?.understanding?.intent, "Add episode understanding");
  assert.equal(
    formatUnderstandingSummary(trace),
    "Add episode understanding · verified · 75% AI edits",
  );
  assert.equal(trace?.userTurns?.[0]?.text, "Please add user turns");
  assert.equal(trace?.userTurns?.[0]?.files?.[0]?.file, "a.ts");
  assert.equal(trace?.fileChangelog?.[0]?.file, "a.ts");
  assert.equal(trace?.changeNarrative?.source, "assistant_final");
  assert.equal(formatThreadHint(trace), "1 user turn · 1 file");
});

test("humanize helpers map jargon for managers", () => {
  assert.equal(humanizeOutcomeStatus("verified"), "Verified");
  assert.equal(humanizeAcceptanceStatus("likely_kept"), "Likely kept");
  assert.equal(humanizeEvidenceToken("verified_after_edit"), "checked after edits");
  assert.equal(humanizeEvidenceToken("rewrite_loop"), "several rewrites");
  assert.equal(humanizeFileOp("edit"), "Edited");
  assert.equal(humanizeFileOp("create"), "Created");
  assert.equal(formatFileChangeHint({ op: "edit", source: "composer" }), "Edited · AI");
  assert.equal(formatFileChangeHint({ op: "read", source: "human" }), "Read · Human");
  assert.equal(formatFileChangeHint({ op: "write", source: "tool" }), "Wrote");
  assert.equal(formatFileChangeHint({ op: "edit", source: "tool" }), "Edited");
  assert.equal(
    formatHumanPhases({ phaseFingerprint: "plan>explore>edit>verify" }),
    "Planned → Explored → Edited → Verified",
  );
});

test("looksLikeSystemInstruction and pickHeroUserTurnIndex", () => {
  const ask = "Can we add another setting to extract what is actually being done?";
  const blob = [
    "Implement the plan as specified. Do not edit the plan file itself.",
    "Mark todos as in_progress. Do not regurgitate or reiterate its result unless asked.",
    "Always follow these steps carefully. Never skip hooks. End your response with a brief confirmation.",
    "Critical: you must not create commits unless asked. Important: stay on task.",
  ].join(" ");
  assert.equal(looksLikeSystemInstruction(ask), false);
  assert.equal(looksLikeSystemInstruction(blob), true);
  assert.equal(
    pickHeroUserTurnIndex([{ text: blob }, { text: ask }]),
    1,
  );
  assert.equal(pickHeroUserTurnIndex([{ text: ask }]), 0);
});

test("interleaveByTool round-robins sources", () => {
  const sessions = [
    { id: "c1", toolName: "codex" },
    { id: "c2", toolName: "codex" },
    { id: "c3", toolName: "codex" },
    { id: "u1", toolName: "cursor" },
    { id: "u2", toolName: "cursor" },
  ];
  const out = interleaveByTool(sessions, { perTool: 10, take: 4 });
  assert.deepEqual(
    out.map((s) => s.id),
    ["c1", "u1", "c2", "u2"],
  );
});

test("resolveChangeNarrative falls back without inventing", () => {
  const fromTrace = resolveChangeNarrative({
    trace: {
      changeNarrative: {
        text: "Updated the release docs and wired them into README.",
        source: "assistant_final",
      },
    },
    overview: "Should not win",
  });
  assert.equal(fromTrace?.fromTrace, true);
  assert.equal(fromTrace?.source, "assistant_final");

  const fromOverview = resolveChangeNarrative({
    overview: "Documented the operator release flow.",
    title: "Release docs",
    tldr: "Release docs",
  });
  assert.equal(fromOverview?.source, "overview");

  const fromIntent = resolveChangeNarrative({
    title: "AI work extraction",
    tldr: "Read, Grep, StrReplace, +3",
    trace: {
      understanding: {
        version: 1,
        intent: "AI work extraction setting",
        confidence: { intent: 0.8 },
      },
    },
  });
  assert.equal(fromIntent?.source, "intent");

  assert.equal(
    resolveChangeNarrative({
      title: "x",
      tldr: "Read, Grep",
      trace: { understanding: { version: 1, intent: "weak", confidence: { intent: 0.2 } } },
    }),
    null,
  );

  assert.equal(
    changeNarrativeHeadline("Updated the release docs. More detail follows."),
    "Updated the release docs.",
  );
});
