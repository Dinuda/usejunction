/**
 * Claimable materialization job queue backed by AnalyticsWatermark.
 * Workers / cron claim orgs via FOR UPDATE SKIP LOCKED and drain dirty days.
 */
import { prisma } from "@usejunction/db";
import { ORG_DAY_SNAPSHOT_VERSION, ORG_DAY_WATERMARK_KIND, rematerializeOrgSnapshots } from "./materialize";
import { logServerError } from "@/lib/errors/public";

const JOB_KIND = "materialize_dirty";

/** Stale running claims older than this are reclaimable (Fluid after() has no retry). */
const DEFAULT_CLAIM_STALE_MS = 5 * 60_000;

export type MaterializeEntryPoint = "commit" | "poll" | "cron" | "sync_now" | "empty_delta";

export async function enqueueMaterializationJob(orgId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const row = await tx.analyticsWatermark.upsert({
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
        lastError: null,
      },
    });
    // Do not clobber an in-flight drain — it will re-check dirtyRemaining on exit.
    if (row.status === "running") return;
    await tx.analyticsWatermark.update({
      where: { id: row.id },
      data: { status: "pending", lastError: null },
    });
  });
}

/**
 * Atomically claim the org's materialize_dirty watermark for exclusive drain.
 * Refuses if already running and updatedAt is newer than staleMs.
 */
export async function claimMaterializationJob(
  orgId: string,
  options: { staleMs?: number } = {},
): Promise<{ claimed: true; jobId: string } | { claimed: false }> {
  const staleMs = options.staleMs ?? DEFAULT_CLAIM_STALE_MS;
  const staleBefore = new Date(Date.now() - staleMs);

  const claimed = await prisma.$transaction(async (tx) => {
    await tx.analyticsWatermark.upsert({
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
      update: {},
    });

    const rows = await tx.$queryRaw<Array<{ id: string; status: string; updated_at: Date }>>`
      SELECT id, status, updated_at
      FROM analytics_watermarks
      WHERE org_id = ${orgId}
        AND kind = ${JOB_KIND}
        AND metric_version = ${ORG_DAY_SNAPSHOT_VERSION}
      FOR UPDATE
      LIMIT 1
    `;
    const row = rows[0];
    if (!row) return null;

    if (row.status === "running" && row.updated_at > staleBefore) {
      return null;
    }

    await tx.analyticsWatermark.update({
      where: { id: row.id },
      data: { status: "running", lastError: null },
    });
    return row.id;
  });

  if (!claimed) return { claimed: false };
  return { claimed: true, jobId: claimed };
}

async function releaseMaterializationJob(
  orgId: string,
  jobId: string | null,
  status: "pending" | "idle" | "error",
  lastError?: string | null,
): Promise<void> {
  if (jobId) {
    await prisma.analyticsWatermark.update({
      where: { id: jobId },
      data: {
        status,
        cursorDate: new Date(),
        lastError: lastError ?? null,
      },
    });
  } else {
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
        status,
        cursorDate: new Date(),
        lastError: lastError ?? null,
      },
      update: {
        status,
        cursorDate: new Date(),
        lastError: lastError ?? null,
      },
    });
  }

  await prisma.analyticsWatermark.upsert({
    where: {
      orgId_kind_metricVersion: {
        orgId,
        kind: ORG_DAY_WATERMARK_KIND,
        metricVersion: ORG_DAY_SNAPSHOT_VERSION,
      },
    },
    create: {
      orgId,
      kind: ORG_DAY_WATERMARK_KIND,
      metricVersion: ORG_DAY_SNAPSHOT_VERSION,
      status,
      cursorDate: new Date(),
    },
    update: {
      status,
      cursorDate: new Date(),
    },
  });
}

/**
 * Rematerialize one org immediately — the sync-pipeline settle step.
 * Claim-guarded so overlapping commit/poll drains collapse into one.
 * Falls back to enqueue on failure so dirty days are not stranded forever.
 */
export async function materializeOrgNow(
  orgId: string,
  options: {
    includeToday?: boolean;
    maxDurationMs?: number;
    entryPoint?: MaterializeEntryPoint;
  } = {},
): Promise<{ dirtyDays: number; rows: number; dirtyRemaining: number; claimed: boolean }> {
  const entryPoint = options.entryPoint ?? "commit";
  const budgetMs = options.maxDurationMs;
  const dirtyBefore = await prisma.analyticsDirtyDay.count({
    where: { orgId, metricVersion: ORG_DAY_SNAPSHOT_VERSION },
  });

  const claim = await claimMaterializationJob(orgId);
  if (!claim.claimed) {
    console.info("[snapshots/materialize-drain]", {
      orgId,
      entryPoint,
      claimed: false,
      skipped: true,
      dirtyBefore,
      dirtyAfter: dirtyBefore,
      budgetMs: budgetMs ?? null,
      elapsedMs: 0,
    });
    return { dirtyDays: 0, rows: 0, dirtyRemaining: dirtyBefore, claimed: false };
  }

  const started = performance.now();
  try {
    const result = await rematerializeOrgSnapshots(orgId, {
      metricVersion: ORG_DAY_SNAPSHOT_VERSION,
      includeToday: options.includeToday !== false,
      maxDurationMs: options.maxDurationMs,
    });
    const status = result.dirtyRemaining > 0 ? "pending" : "idle";
    await releaseMaterializationJob(orgId, claim.jobId, status);
    console.info("[snapshots/materialize-drain]", {
      orgId,
      entryPoint,
      claimed: true,
      skipped: false,
      dirtyBefore,
      dirtyAfter: result.dirtyRemaining,
      dirtyDays: result.dirtyDays,
      rows: result.rows,
      budgetMs: budgetMs ?? null,
      elapsedMs: Math.round(performance.now() - started),
    });
    return { ...result, claimed: true };
  } catch (error) {
    logServerError("snapshots/materialize_now", error, { orgId });
    await releaseMaterializationJob(
      orgId,
      claim.jobId,
      "error",
      error instanceof Error ? error.message.slice(0, 500) : "materialize failed",
    );
    // Leave the job pending/error for cron to retry.
    await enqueueMaterializationJob(orgId);
    const dirtyRemaining = await prisma.analyticsDirtyDay.count({
      where: { orgId, metricVersion: ORG_DAY_SNAPSHOT_VERSION },
    });
    console.info("[snapshots/materialize-drain]", {
      orgId,
      entryPoint,
      claimed: true,
      skipped: false,
      error: true,
      dirtyBefore,
      dirtyAfter: dirtyRemaining,
      budgetMs: budgetMs ?? null,
      elapsedMs: Math.round(performance.now() - started),
    });
    return { dirtyDays: 0, rows: 0, dirtyRemaining, claimed: true };
  }
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

    const dirtyBefore = await prisma.analyticsDirtyDay.count({
      where: { orgId: job.org_id, metricVersion: ORG_DAY_SNAPSHOT_VERSION },
    });
    const started = performance.now();
    try {
      const remainingMs = Math.max(1_000, deadline - Date.now());
      const result = await rematerializeOrgSnapshots(job.org_id, {
        metricVersion: ORG_DAY_SNAPSHOT_VERSION,
        includeToday: true,
        maxDurationMs: remainingMs,
      });
      dirtyCleared += result.dirtyDays;
      await releaseMaterializationJob(
        job.org_id,
        job.id,
        result.dirtyRemaining > 0 ? "pending" : "idle",
      );
      console.info("[snapshots/materialize-drain]", {
        orgId: job.org_id,
        entryPoint: "cron" satisfies MaterializeEntryPoint,
        claimed: true,
        skipped: false,
        dirtyBefore,
        dirtyAfter: result.dirtyRemaining,
        dirtyDays: result.dirtyDays,
        rows: result.rows,
        budgetMs: remainingMs,
        elapsedMs: Math.round(performance.now() - started),
      });
    } catch (error) {
      logServerError("snapshots/materialize_job", error, { orgId: job.org_id });
      await releaseMaterializationJob(
        job.org_id,
        job.id,
        "error",
        error instanceof Error ? error.message.slice(0, 500) : "materialize failed",
      );
      console.info("[snapshots/materialize-drain]", {
        orgId: job.org_id,
        entryPoint: "cron" satisfies MaterializeEntryPoint,
        claimed: true,
        skipped: false,
        error: true,
        dirtyBefore,
        dirtyAfter: dirtyBefore,
        budgetMs: Math.max(1_000, deadline - Date.now()),
        elapsedMs: Math.round(performance.now() - started),
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
