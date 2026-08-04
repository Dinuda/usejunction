import test from "node:test";
import assert from "node:assert/strict";
import { isApprovedSourcePath } from "../src/sources/files.js";

test("only approved session and aggregate-cache paths are allowed", () => {
  assert.equal(isApprovedSourcePath("/Users/example/.claude/projects/p/session.jsonl"), true);
  assert.equal(isApprovedSourcePath("/Users/example/.codex/sessions/2026/08/rollout-a.jsonl"), true);
  assert.equal(isApprovedSourcePath("/Users/example/.cursor/projects/p/agent-transcripts/a.jsonl"), true);
  assert.equal(isApprovedSourcePath("/Users/example/.usejunction/cache/cost-usage/codex.json"), true);
  assert.equal(isApprovedSourcePath("/Users/example/.claude/settings.json"), false);
  assert.equal(isApprovedSourcePath("/Users/example/.codex/sqlite/logs.sqlite"), false);
  assert.equal(isApprovedSourcePath("/Users/example/.usejunction/config.json"), false);
});
