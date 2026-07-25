import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Workspace page loaders and their usage helpers must not call live usage_daily
 * CTEs. Snapshots are the only page-path source for usage KPIs.
 */
const root = new URL("..", import.meta.url).pathname;
const scanFiles = [
  join(root, "lib/app-pages"),
  join(root, "lib/queries/dashboard"),
  join(root, "lib/queries/me"),
  join(root, "lib/read-models"),
  join(root, "lib/insights/queries"),
  join(root, "lib/reports/canonical-usage.ts"),
];

const forbidden = [
  /\breadUsageMetrics\b/,
  /\bexecuteUsageQuery\b/,
  /\breadCachedCanonicalBillingFacts\b/,
  /\brunUsageQuerySql\b/,
];

const failures = [];

function visit(path) {
  const st = statSync(path);
  if (st.isDirectory()) {
    for (const name of readdirSync(path)) visit(join(path, name));
    return;
  }
  if (!/\.(?:ts|tsx)$/.test(path)) return;
  // Ad-hoc insights API and billing-facts module stay live for debugging.
  if (path.includes("/analytics/query/")) return;
  const source = readFileSync(path, "utf8");
  for (const rule of forbidden) {
    if (rule.test(source)) {
      failures.push(`${relative(root, path)} imports/calls live usage SQL (${rule})`);
    }
  }
}

for (const path of scanFiles) visit(path);
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("Page loaders verified: no live usage SQL on snapshot read paths.");
