import { prisma } from "@usejunction/db";
import {
  DAILY_REPORT_SEND_HOUR,
  localDateString,
  localHour,
} from "@/lib/timezone";

export type ReportUsageTotals = {
  tokens: number;
  cost: number;
  requests: number;
};

type SnapshotDelegate = {
  findUnique: (args: {
    where: {
      orgId_developerId_localDate: {
        orgId: string;
        developerId: string;
        localDate: string;
      };
    };
    select: { tokens: true; costMicros: true; requests: true };
  }) => Promise<{ tokens: bigint; costMicros: bigint; requests: number } | null>;
  upsert: (args: {
    where: {
      orgId_developerId_localDate: {
        orgId: string;
        developerId: string;
        localDate: string;
      };
    };
    create: {
      orgId: string;
      developerId: string;
      localDate: string;
      sendHour: number;
      tokens: bigint;
      costMicros: bigint;
      requests: number;
      capturedAt: Date;
    };
    update: {
      sendHour: number;
      tokens: bigint;
      costMicros: bigint;
      requests: number;
      capturedAt: Date;
    };
  }) => Promise<unknown>;
};

function developerScopeKey(developerId?: string | null): string {
  return developerId?.trim() || "";
}

/** Stale long-lived Prisma clients may not include new delegates until restart. */
function snapshotDelegate(): SnapshotDelegate | null {
  const delegate = (prisma as unknown as { dailyReportUsageSnapshot?: SnapshotDelegate })
    .dailyReportUsageSnapshot;
  return delegate ?? null;
}

function isMissingSnapshotStorage(error: unknown): boolean {
  if (error == null || typeof error !== "object" || !("code" in error)) return false;
  const code = String((error as { code: unknown }).code);
  // P2021 = table does not exist; P2010 = raw query failed (migration pending).
  return code === "P2021" || code === "P2010";
}

export function isReportDeltaComparable(input: {
  localDate: string;
  timeZone: string;
  now?: Date;
}): boolean {
  const now = input.now ?? new Date();
  const today = localDateString(now, input.timeZone);
  if (input.localDate < today) return true;
  if (input.localDate > today) return false;
  return localHour(now, input.timeZone) >= DAILY_REPORT_SEND_HOUR;
}

export async function readDailyReportUsageSnapshot(input: {
  orgId: string;
  developerId?: string | null;
  localDate: string;
}): Promise<ReportUsageTotals | null> {
  const delegate = snapshotDelegate();
  if (!delegate) return null;

  try {
    const row = await delegate.findUnique({
      where: {
        orgId_developerId_localDate: {
          orgId: input.orgId,
          developerId: developerScopeKey(input.developerId),
          localDate: input.localDate,
        },
      },
      select: { tokens: true, costMicros: true, requests: true },
    });
    if (!row) return null;
    return {
      tokens: Number(row.tokens),
      cost: Number(row.costMicros) / 1_000_000,
      requests: row.requests,
    };
  } catch (error) {
    if (isMissingSnapshotStorage(error)) return null;
    throw error;
  }
}

export async function captureDailyReportUsageSnapshot(input: {
  orgId: string;
  developerId?: string | null;
  localDate: string;
  totals: ReportUsageTotals;
  capturedAt?: Date;
  sendHour?: number;
}): Promise<void> {
  const delegate = snapshotDelegate();
  if (!delegate) return;

  const capturedAt = input.capturedAt ?? new Date();
  const developerId = developerScopeKey(input.developerId);

  try {
    await delegate.upsert({
      where: {
        orgId_developerId_localDate: {
          orgId: input.orgId,
          developerId,
          localDate: input.localDate,
        },
      },
      create: {
        orgId: input.orgId,
        developerId,
        localDate: input.localDate,
        sendHour: input.sendHour ?? DAILY_REPORT_SEND_HOUR,
        tokens: BigInt(Math.max(0, Math.round(input.totals.tokens))),
        costMicros: BigInt(Math.max(0, Math.round(input.totals.cost * 1_000_000))),
        requests: Math.max(0, Math.round(input.totals.requests)),
        capturedAt,
      },
      update: {
        sendHour: input.sendHour ?? DAILY_REPORT_SEND_HOUR,
        tokens: BigInt(Math.max(0, Math.round(input.totals.tokens))),
        costMicros: BigInt(Math.max(0, Math.round(input.totals.cost * 1_000_000))),
        requests: Math.max(0, Math.round(input.totals.requests)),
        capturedAt,
      },
    });
  } catch (error) {
    if (isMissingSnapshotStorage(error)) return;
    throw error;
  }
}

/** Persist send-time totals once the local report hour is reached. */
export async function maybeCaptureDailyReportUsageSnapshot(input: {
  orgId: string;
  developerId?: string | null;
  localDate: string;
  timeZone: string;
  totals: ReportUsageTotals;
  now?: Date;
}): Promise<void> {
  const now = input.now ?? new Date();
  if (!isReportDeltaComparable({ localDate: input.localDate, timeZone: input.timeZone, now })) {
    return;
  }
  await captureDailyReportUsageSnapshot({
    orgId: input.orgId,
    developerId: input.developerId,
    localDate: input.localDate,
    totals: input.totals,
    capturedAt: now,
  });
}
