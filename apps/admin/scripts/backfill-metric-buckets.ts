/**
 * Backfill retained metric buckets for a metricVersion (or repair an org).
 *
 * Usage (from apps/admin):
 *   pnpm exec tsx scripts/backfill-metric-buckets.ts --org <orgId>
 *   pnpm exec tsx scripts/backfill-metric-buckets.ts --all --version metrics-v2
 *
 * When bumping METRIC_VERSION:
 * 1. Change METRIC_VERSION in lib/analytics/metric-version.ts
 * 2. Run this with --version <new> --all (day-chunked backfill from facts)
 * 3. Readers use the new constant; old version buckets are retained until GC
 */
import { prisma } from "@usejunction/db";
import { materializeOrgBuckets } from "@/lib/analytics/materialize-metric-buckets";
import { METRIC_VERSION } from "@/lib/analytics/metric-version";
import { utcDateOnly } from "@/lib/metrics/date-range";

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

async function main() {
  const version = arg("version") ?? METRIC_VERSION;
  const orgId = arg("org");
  const from = arg("from") ? utcDateOnly(new Date(arg("from")!)) : undefined;
  const to = arg("to") ? utcDateOnly(new Date(arg("to")!)) : undefined;
  const all = process.argv.includes("--all");

  const orgIds = orgId
    ? [orgId]
    : all
      ? (await prisma.organization.findMany({ select: { id: true } })).map((row) => row.id)
      : [];

  if (orgIds.length === 0) {
    console.error("Pass --org <id> or --all");
    process.exit(1);
  }

  for (const id of orgIds) {
    const result = await materializeOrgBuckets({
      orgId: id,
      metricVersion: version,
      fromDate: from,
      toDate: to,
    });
    console.log(JSON.stringify(result));
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
