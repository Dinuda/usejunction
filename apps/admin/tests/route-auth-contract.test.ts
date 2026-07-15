import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { machineAuthenticatedRoutes } from "../lib/machine-auth-routes";

const contracts: Record<string, RegExp> = {
  "/api/enroll": /enrollmentToken\.findUnique/,
  "/api/ingest/request": /requireIngestAuth/,
  "/api/ingest/local-usage": /deviceTokenHash|requireIngestAuth/,
  "/api/devices/heartbeat": /deviceTokenHash/,
  "/api/devices/tools": /deviceTokenHash/,
  "/api/devices/local-models": /deviceTokenHash/,
  "/api/devices/accounts": /deviceTokenHash/,
  "/api/devices/quota": /deviceTokenHash/,
  "/api/otel/v1/metrics": /resolveOtelAuth/,
  "/api/cron/provider-sync": /verifyConfiguredBearer/,
  "/api/cron/litellm-budget": /verifyConfiguredBearer/,
  "/api/cron/materialize-metrics": /verifyConfiguredBearer/,
};

test("every middleware-public machine route declares handler authentication", () => {
  assert.deepEqual([...machineAuthenticatedRoutes].sort(), Object.keys(contracts).sort());
  const appRoot = path.resolve(process.cwd(), "app");
  for (const [route, marker] of Object.entries(contracts)) {
    const source = readFileSync(path.join(appRoot, route.replace(/^\/api\//, "api/"), "route.ts"), "utf8");
    assert.match(source, marker, `${route} is missing its authentication contract`);
  }
});
