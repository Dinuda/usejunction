/**
 * Claimable materialization job queue backed by AnalyticsWatermark.
 * Workers / cron claim orgs via FOR UPDATE SKIP LOCKED and drain dirty days.
 */
import { prisma } from "@usejunction/db";
import { ORG_DAY_SNAPSHOT_VERSION, ORG_DAY_WATERMARK_KIND, rematerializeOrgSnapshots } from "./materialize";
import { logServerError } from "@/lib/errors/public";

const JOB_KIND = "materialize_dirty";

export async function enqueueMaterializationJob(orgId: string): Promise<void> {
  await prisma.analyticsWatermark.upsert({
    where: {
      orgId_kind_metricVersion: {
        orgId,
        kind: JOB_KIND,
        metricVersion: ORG_DAY_SNAPSHOT_VERSION,
      },
    },
    create: {
      orgId,
      kind: JOB_KIND,
      metricVersion: ORG_DAY_SNAPSHOT_VERSION,
      status: "pending",
    },
    update: {
      status: "pending",
      lastError: null,
    },
  });
}

/** Mark all active orgs pending after a calculation/pricing version bump. */
export async function enqueueVersionBumpRematerialize(): Promise<number> {
  const orgs = await prisma.organization.findMany({
    select: { id: true },
    take: 5_000,
  });
  for (const org of orgs) {
    await enqueueMaterializationJob(org.id);
  }
  return orgs.length;
}

/**
 * Claim up to `limit` pending jobs and rematerialize each org.
 * Safe for concurrent cron workers (row lock via SKIP LOCKED).
 */
export async function drainMaterializationJobs(options: {
  limit?: number;
  maxDurationMs?: number;
} = {}): Promise<{ processed: number; dirtyCleared: number; remainingJobs: number }> {
  const limit = options.limit ?? 50;
  const deadline = Date.now() + (options.maxDurationMs ?? 50_000);
  let processed = 0;
  let dirtyCleared = 0;

  while (processed < limit && Date.now() < deadline) {
    const job = await prisma.$transaction(async (tx) => {
      const claimed = await tx.$queryRaw<Array<{ id: string; org_id: string }>>`
        SELECT id, org_id
        FROM analytics_watermarks
        WHERE kind = ${JOB_KIND}
          AND metric_version = ${ORG_DAY_SNAPSHOT_VERSION}
          AND status IN ('pending', 'error')
        ORDER BY updated_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      `;
      const row = claimed[0];
      if (!row) return null;
      await tx.analyticsWatermark.update({
        where: { id: row.id },
        data: { status: "running", lastError: null },
      });
      return row;
    });
    if (!job) break;

    try {
      const result = await rematerializeOrgSnapshots(job.org_id, {
        metricVersion: ORG_DAY_SNAPSHOT_VERSION,
        includeToday: true,
      });
      dirtyCleared += result.dirtyDays;
      await prisma.analyticsWatermark.update({
        where: { id: job.id },
        data: {
          status: result.dirtyRemaining > 0 ? "pending" : "idle",
          cursorDate: new Date(),
          lastError: null,
        },
      });
      await prisma.analyticsWatermark.upsert({
        where: {
          orgId_kind_metricVersion: {
            orgId: job.org_id,
            kind: ORG_DAY_WATERMARK_KIND,
            metricVersion: ORG_DAY_SNAPSHOT_VERSION,
          },
        },
        create: {
          orgId: job.org_id,
          kind: ORG_DAY_WATERMARK_KIND,
          metricVersion: ORG_DAY_SNAPSHOT_VERSION,
          status: result.dirtyRemaining > 0 ? "pending" : "idle",
          cursorDate: new Date(),
        },
        update: {
          status: result.dirtyRemaining > 0 ? "pending" : "idle",
          cursorDate: new Date(),
        },
      });
    } catch (error) {
      logServerError("snapshots/materialize_job", error, { orgId: job.org_id });
      await prisma.analyticsWatermark.update({
        where: { id: job.id },
        data: {
          status: "error",
          lastError: error instanceof Error ? error.message.slice(0, 500) : "materialize failed",
        },
      });
    }
    processed += 1;
  }

  const remainingJobs = await prisma.analyticsWatermark.count({
    where: {
      kind: JOB_KIND,
      metricVersion: ORG_DAY_SNAPSHOT_VERSION,
      status: { in: ["pending", "error", "running"] },
    },
  });

  return { processed, dirtyCleared, remainingJobs };
}
