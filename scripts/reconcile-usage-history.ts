#!/usr/bin/env tsx
/**
 * Usage history reconciliation — dry-run by default.
 *
 * Usage:
 *   pnpm tsx scripts/reconcile-usage-history.ts --org <orgId> [--apply] [--since 2026-04-01]
 */
import { PrismaClient } from "@usejunction/db";

const prisma = new PrismaClient();

type Args = { orgId: string; apply: boolean; since: Date };

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const orgIdx = argv.indexOf("--org");
  const sinceIdx = argv.indexOf("--since");
  const orgId = orgIdx >= 0 ? argv[orgIdx + 1] : process.env.ORG_ID;
  if (!orgId) {
    console.error("Missing --org <orgId>");
    process.exit(1);
  }
  const since = sinceIdx >= 0 ? new Date(argv[sinceIdx + 1]) : new Date(Date.now() - 90 * 86_400_000);
  return { orgId, apply: argv.includes("--apply"), since };
}

async function snapshotTable(orgId: string, since: Date) {
  const [usage, local] = await Promise.all([
    prisma.usageDaily.findMany({ where: { orgId, date: { gte: since } } }),
    prisma.localUsageAggregate.findMany({ where: { orgId, date: { gte: since } } }),
  ]);
  return {
    usageCount: usage.length,
    localCount: local.length,
    usageRequests: usage.reduce((n, r) => n + r.requests, 0),
    usageCostMicros: usage.reduce((n, r) => n + Number(r.costMicros), 0),
    localRequests: local.reduce((n, r) => n + r.requests, 0),
    localCost: local.reduce((n, r) => n + r.estimatedCost, 0),
  };
}

async function main() {
  const { orgId, apply, since } = parseArgs();
  console.log(`Reconcile org=${orgId} since=${since.toISOString().slice(0, 10)} apply=${apply}`);

  const before = await snapshotTable(orgId, since);
  console.log("Before:", before);

  const fixes = {
    cursorProductivityRequests: await prisma.usageDaily.count({
      where: {
        orgId,
        date: { gte: since },
        toolName: "cursor",
        metricKind: "productivity",
        requests: { gt: 0 },
      },
    }),
    staleCodexRows: await prisma.usageDaily.count({
      where: {
        orgId,
        date: { gte: since },
        toolName: "codex",
        OR: [{ calculationVersion: null }, { calculationVersion: { not: "usage-v2" } }],
      },
    }),
  };
  console.log("Issues detected:", fixes);

  if (!apply) {
    console.log("Dry run complete. Re-run with --apply to mutate rows, then trigger `usejunction collect --refresh` on devices.");
    return;
  }

  await prisma.$transaction([
    prisma.usageDaily.updateMany({
      where: {
        orgId,
        date: { gte: since },
        toolName: "cursor",
        OR: [
          { metricKind: "productivity" },
          { model: { in: ["ai-lines", "commits"] } },
          { source: "cursor_local" },
        ],
      },
      data: { requests: 0, metricKind: "productivity" },
    }),
    prisma.localUsageAggregate.updateMany({
      where: {
        orgId,
        date: { gte: since },
        toolName: "cursor",
        source: { in: ["cursor_local", "device_observed"] },
      },
      data: { requests: 0, metricKind: "productivity" },
    }),
    prisma.usageDaily.updateMany({
      where: {
        orgId,
        date: { gte: since },
        toolName: "codex",
        OR: [{ calculationVersion: null }, { calculationVersion: { not: "usage-v2" } }],
      },
      data: { calculationVersion: "usage-v1-stale" },
    }),
    prisma.usageDaily.updateMany({
      where: { orgId, date: { gte: since }, source: "cursor_usage_events" },
      data: { source: "vendor_verified", verified: true, costKind: "verified_usage" },
    }),
  ]);

  const after = await snapshotTable(orgId, since);
  console.log("After:", after);
  console.log("Next: run `usejunction collect --refresh` on connected devices to rebuild Codex/Cursor history.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
