import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

test("community schema stores opaque credentials as hashes only", () => {
  const schema = readFileSync(path.resolve(process.cwd(), "../../packages/db/prisma/schema.prisma"), "utf8");
  assert.match(schema, /deviceTokenHash\s+String/);
  assert.match(schema, /pollTokenHash\s+String\?/);
  assert.doesNotMatch(schema, /deviceToken\s+String/);
  assert.doesNotMatch(schema, /enrollmentTokenReveal/);
  assert.doesNotMatch(schema, /tokenReveal/);
});

test("community schema excludes SaaS persistence", () => {
  const schema = readFileSync(path.resolve(process.cwd(), "../../packages/db/prisma/schema.prisma"), "utf8");
  assert.doesNotMatch(schema, /lemonSqueezy|subscriptionStatus|trialEndsAt|PlanInterest/);
  assert.match(schema, /plan\s+String\s+@default\("community"\)/);
});
