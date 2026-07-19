#!/usr/bin/env tsx
/**
 * Repair detected subscription cycle anchors from live quota resets.
 *
 * Usage (from apps/admin):
 *   pnpm tsx ../../scripts/repair-detected-cycles.ts
 *   pnpm tsx ../../scripts/repair-detected-cycles.ts --org <orgId>
 */
import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(__dirname, "../apps/admin/.env") });

async function main() {
  const { repairDetectedPlanCycles } = await import("../apps/admin/lib/tools/sync-detected");
  const orgIdx = process.argv.indexOf("--org");
  const orgId = orgIdx >= 0 ? process.argv[orgIdx + 1] : undefined;
  const result = await repairDetectedPlanCycles(orgId);
  console.log(JSON.stringify(result, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
