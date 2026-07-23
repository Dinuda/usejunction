import assert from "node:assert/strict";
import { test } from "vitest";
import {
  toolsInventoryCanonicalLine,
  toolsInventoryContentHash,
} from "@/lib/sync/tools-inventory";

test("toolsInventoryContentHash is stable under reorder", () => {
  const a = toolsInventoryContentHash([
    { toolName: "cursor", detected: true, configured: true, version: "1.0", configPath: "/a" },
    { toolName: "codex", detected: true, configured: false, version: "2.0", configPath: "/b" },
  ]);
  const b = toolsInventoryContentHash([
    { toolName: "codex", detected: true, configured: false, version: "2.0", configPath: "/b" },
    { toolName: "cursor", detected: true, configured: true, version: "1.0", configPath: "/a" },
  ]);
  assert.equal(a, b);
  assert.equal(a.length, 32);
});

test("toolsInventoryContentHash changes when configured or version flips", () => {
  const base = toolsInventoryContentHash([
    { toolName: "cursor", detected: true, configured: false, version: "1.0" },
  ]);
  const configured = toolsInventoryContentHash([
    { toolName: "cursor", detected: true, configured: true, version: "1.0" },
  ]);
  const version = toolsInventoryContentHash([
    { toolName: "cursor", detected: true, configured: false, version: "1.1" },
  ]);
  assert.notEqual(base, configured);
  assert.notEqual(base, version);
});

test("toolsInventoryCanonicalLine matches agent format", () => {
  assert.equal(
    toolsInventoryCanonicalLine({
      toolName: "codex",
      detected: true,
      configured: true,
      version: "0.1",
      configPath: "/x",
    }),
    "codex|1|1|0.1|/x",
  );
  assert.equal(
    toolsInventoryCanonicalLine({
      toolName: "codex",
      detected: false,
      configured: false,
    }),
    "codex|0|0||",
  );
});

test("toolsInventoryContentHash matches agent fixture", () => {
  assert.equal(
    toolsInventoryContentHash([
      { toolName: "cursor", detected: true, configured: true, version: "1.0", configPath: "/a" },
      { toolName: "codex", detected: true, configured: false, version: "2.0", configPath: "/b" },
    ]),
    "a036ac0d9be668e0f61d9265a7d4777a",
  );
});
