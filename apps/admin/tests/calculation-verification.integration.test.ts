import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "vitest";
import { prisma } from "@usejunction/db";

const ADMIN_ROOT = path.join(__dirname, "..");
const REPORT_PATH = path.join(ADMIN_ROOT, "scripts/calculation-verification-report.json");
const ORG_SLUG = "e2e-calculation-fixture";

type ReportCheck = {
  surface: string;
  view: string;
  metric: string;
  actual: number | string | boolean | null;
};

function actualFor(checks: ReportCheck[], surface: string, view: string, metric: string) {
  const match = checks.find((c) => c.surface === surface && c.view === view && c.metric === metric);
  assert.ok(match, `missing check ${surface} / ${view} / ${metric}`);
  return match.actual;
}

test("golden fixture calculation verification", {
  skip: process.env.RUN_CALC_VERIFICATION_TESTS !== "1",
}, async () => {
  const org = await prisma.organization.findUnique({
    where: { slug: ORG_SLUG },
    select: { id: true },
  });
  assert.ok(org, `expected seeded org ${ORG_SLUG}; run e2e:seed first`);

  execSync("pnpm verify:calcs", {
    cwd: ADMIN_ROOT,
    stdio: "pipe",
    env: process.env,
  });

  const report = JSON.parse(readFileSync(REPORT_PATH, "utf8")) as {
    asOf: string;
    summary: { failed: number };
    checks: ReportCheck[];
  };

  assert.equal(report.asOf, "2026-07-16T12:00:00.000Z");
  assert.equal(report.summary.failed, 0);

  const { checks } = report;
  assert.equal(actualFor(checks, "/dashboard", "current_cycles", "kpis.actualSpend$"), 40);
  assert.equal(actualFor(checks, "/dashboard", "current_cycles", "kpis.verifiedUsageCost"), 25);
  assert.equal(actualFor(checks, "/dashboard", "current_cycles", "kpis.estimatedApiCost"), 2);
  assert.equal(actualFor(checks, "/dashboard", "current_cycles", "cursor.modelCalls"), 10);
  assert.equal(actualFor(checks, "/dashboard", "last_30_days", "kpis.actualSpend$"), 39.31);
});
