import assert from "node:assert/strict";
import { test } from "vitest";
import {
  containsForbiddenSignalsField,
  containsForbiddenWorkExtractionField,
  signalsIngestSchema,
  workSessionsIngestSchema,
} from "../lib/signals/contracts";

test("signals ingest accepts domain-level sessions", () => {
  const parsed = signalsIngestSchema.safeParse({
    sessions: [{
      localId: "sig_abc123",
      startedAt: "2026-07-15T10:04:00.000Z",
      endedAt: "2026-07-15T10:12:00.000Z",
      durationSeconds: 480,
      aiTool: "chatgpt",
      appBefore: "Chrome",
      domainBefore: "hubspot.com",
      appAfter: "Microsoft Teams",
      domainAfter: null,
      flowSignature: "crm_to_chatgpt_to_chat",
      confidence: 0.74,
      collectionMode: "app_domain",
      steps: [
        { app: "Chrome", domain: "hubspot.com", startedAt: "2026-07-15T10:01:00.000Z", endedAt: "2026-07-15T10:04:00.000Z" },
        { app: "Chrome", domain: "chatgpt.com", startedAt: "2026-07-15T10:04:00.000Z", endedAt: "2026-07-15T10:12:00.000Z" },
      ],
    }],
  });
  assert.equal(parsed.success, true);
});

test("signals privacy guard detects forbidden nested fields", () => {
  const forbidden = containsForbiddenSignalsField({
    sessions: [{
      localId: "sig_abc123",
      metadata: { prompt: "please do not upload me" },
    }],
  });
  assert.equal(forbidden, "prompt");
});

test("work extraction allows titles but rejects prompts", () => {
  assert.equal(
    containsForbiddenWorkExtractionField({
      sessions: [{ localId: "w1", title: "Add settings toggle", metadata: { prompt: "nope" } }],
    }),
    "prompt",
  );
  assert.equal(
    containsForbiddenWorkExtractionField({
      sessions: [{ localId: "w1", title: "Add settings toggle", tldr: "Structured summary" }],
    }),
    null,
  );
  const parsed = workSessionsIngestSchema.safeParse({
    sessions: [{
      localId: "cursor:abc",
      toolName: "cursor",
      model: "composer-2.5",
      mode: "agent",
      title: "Local AI work extraction setting",
      tldr: "Plan a Signals-gated extraction flag",
      observedAt: "2026-07-17T10:00:00.000Z",
      source: "cursor_conversation_summaries",
      toolCallCounts: { shell: 3, Read: 2 },
    }],
  });
  assert.equal(parsed.success, true);
});

test("work extraction accepts structured traces", () => {
  const parsed = workSessionsIngestSchema.safeParse({
    sessions: [{
      localId: "cursor:abc",
      toolName: "cursor",
      model: "composer-2.5",
      mode: "agent",
      title: "Local AI work extraction",
      observedAt: "2026-07-17T10:00:00.000Z",
      source: "headers+transcript",
      toolCallCounts: { Read: 4, Skill: 1 },
      trace: {
        approach: "agent",
        location: { kind: "repository", project: "usejunction", repository: { host: "github.com", owner: "acme", name: "usejunction" } },
        skills: ["canvas"],
        tools: ["Read", "Skill", "Shell"],
        files: ["page.tsx"],
        steps: [{ kind: "tool", name: "TodoWrite" }],
        stats: { linesAdded: 12, linesRemoved: 3, filesChanged: 2 },
        durationSeconds: 720,
        phases: ["explore", "edit", "verify"],
        phaseFingerprint: "explore>edit>verify",
        churn: { filesRewritten: 2, rewriteEvents: 5 },
        verify: { afterEdit: true, kinds: ["lint", "test"] },
        languages: ["typescript", "go"],
        testInvolved: true,
        skillCounts: { canvas: 2 },
        git: {
          branch: "main",
          committed: true,
          prNumber: 12,
          commits: [{ sha: "abc1234", subject: "Add work traces", filesChanged: 3, linesAdded: 10, linesRemoved: 2 }],
        },
        understanding: {
          version: 1,
          intent: "Expand work-extraction metadata",
          intentSource: "summary",
          context: { kinds: ["repo", "files"], primaryFiles: ["cursor.go"], skills: ["canvas"] },
          actors: { tool: "cursor", model: "composer-2.5", mode: "agent" },
          sequence: { fingerprint: "explore>edit>verify", userTurns: 3, assistantTurns: 4, toolCalls: 12 },
          attempts: { score: 3, signals: ["rewrite_loop", "reprompt"] },
          authorship: { aiEditEvents: 80, humanEditEvents: 20, aiShare: 0.8, requestCount: 4 },
          acceptance: { status: "likely_kept", signals: ["verified_after_edit", "ai_hashes_present"] },
          outcome: { status: "committed", evidence: ["committed_in_window"] },
          confidence: { intent: 0.9, authorship: 0.85, acceptance: 0.55, outcome: 0.7 },
        },
        userTurns: [
          {
            at: "2026-07-17T10:00:00.000Z",
            text: "Expand work-extraction metadata",
            files: [{ file: "cursor.go", op: "edit", source: "tool", events: 3 }],
          },
          { text: "Also capture file changelog" },
        ],
        fileChangelog: [
          { file: "cursor.go", op: "edit", source: "composer", events: 12 },
          { file: "contracts.ts", op: "write", source: "tool", events: 1 },
        ],
        changeNarrative: {
          text: "Updated work extraction to capture a clipped change narrative after edits.\n\n- Allowlisted changeNarrative.text on ingest\n- Prefer conversation summaries over assistant wrap-ups",
          source: "assistant_final",
          at: "2026-07-17T10:05:00.000Z",
          bullets: [
            "Allowlisted changeNarrative.text on ingest",
            "Prefer conversation summaries over assistant wrap-ups",
          ],
        },
      },
    }],
  });
  assert.equal(parsed.success, true);
});

test("work extraction rejects message bodies", () => {
  assert.equal(
    containsForbiddenWorkExtractionField({
      sessions: [{ localId: "w1", metadata: { message: "user prompt" } }],
    }),
    "message",
  );
});

test("work extraction allows changeNarrative.text without leaking message keys", () => {
  assert.equal(
    containsForbiddenWorkExtractionField({
      sessions: [{
        localId: "w1",
        toolName: "cursor",
        observedAt: "2026-07-17T10:00:00.000Z",
        source: "cursor",
        trace: {
          changeNarrative: {
            text: "Updated the release docs and wired them into README.",
            source: "assistant_final",
          },
        },
      }],
    }),
    null,
  );
});
