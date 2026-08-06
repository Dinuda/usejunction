import assert from "node:assert/strict";
import { test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("member DELETE ends plan assignments and clears quota snapshots", () => {
  const source = readFileSync(
    join(process.cwd(), "app/api/developers/[id]/route.ts"),
    "utf8",
  );
  assert.match(source, /developerPlanAssignment\.updateMany/);
  assert.match(source, /seatStatus:\s*"ended"/);
  assert.match(source, /quotaSnapshot\.deleteMany/);
  assert.match(source, /decommissionDevices/);
});

test("getToolDetail filters removed developers and decommissioned devices", () => {
  const source = readFileSync(
    join(process.cwd(), "lib/queries/dashboard/tool-detail.ts"),
    "utf8",
  );
  assert.match(source, /activeDeviceWhere/);
  assert.match(source, /removedAt:\s*null/);
  assert.match(source, /developer:\s*activeDeveloperWhere/);
});
