import assert from "node:assert/strict";
import { test } from "vitest";
import { rollupPersonalToolsUsage } from "../lib/queries/me/tools-usage-rollup";

test("merges codex and codex-work usage into one ChatGPT row", () => {
  const rows = rollupPersonalToolsUsage(
    [
      { toolName: "codex", requests: 5000, tokens: 585_300_000, cost: 392.99 },
      { toolName: "cursor", requests: 910, tokens: 47_200_000, cost: 190.72 },
      { toolName: "codex-work", requests: 527, tokens: 54_200_000, cost: 27.21 },
    ],
    ["codex", "cursor", "claude", "copilot", "opencode"],
  );

  assert.equal(rows.length, 5);
  assert.deepEqual(
    rows.map((row) => row.toolName),
    ["codex", "cursor", "claude", "copilot", "opencode"],
  );
  assert.equal(rows[0]?.requests, 5527);
  assert.equal(rows[0]?.tokens, 639_500_000);
  assert.equal(rows[0]?.cost, 420.2);
});

test("does not duplicate a detected install already covered by an alias usage row", () => {
  const rows = rollupPersonalToolsUsage(
    [{ toolName: "codex-work", requests: 10, tokens: 100, cost: 1 }],
    ["chatgpt", "claude"],
  );

  assert.equal(rows.length, 2);
  assert.equal(rows[0]?.toolName, "codex");
  assert.equal(rows[0]?.requests, 10);
  assert.equal(rows[1]?.toolName, "claude");
  assert.equal(rows[1]?.requests, 0);
});
