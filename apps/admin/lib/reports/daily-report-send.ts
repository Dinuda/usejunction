import { prisma } from "@usejunction/db";
import { sendDailyReportEmail } from "@/lib/email/daily-report";
import {
  getDailyReportPayload,
  type DailyReportKind,
  type DailyReportPeriod,
} from "@/lib/reports/daily-report";
import {
  isDueForDailyReport,
  isDueForWeeklyOrgReport,
  localDateString,
  normalizeTimeZone,
  weekRangeEndingOnOrBefore,
} from "@/lib/timezone";
import { logServerError } from "@/lib/errors/public";

const ADMIN_ROLES = new Set(["owner", "admin"]);

export type DailyReportSendResult = {
  scanned: number;
  due: number;
  sent: number;
  skipped: number;
  failed: number;
};

async function alreadyDelivered(input: {
  userId: string;
  orgId: string;
  kind: DailyReportKind;
  localDate: string;
}) {
  const row = await prisma.dailyReportDelivery.findUnique({
    where: {
      userId_orgId_kind_localDate: {
        userId: input.userId,
        orgId: input.orgId,
        kind: input.kind,
        localDate: input.localDate,
      },
    },
    select: { status: true },
  });
  return row?.status === "success";
}

async function recordDelivery(input: {
  userId: string;
  orgId: string;
  kind: DailyReportKind;
  localDate: string;
  status: "success" | "failed";
  error?: string;
}) {
  await prisma.dailyReportDelivery.upsert({
    where: {
      userId_orgId_kind_localDate: {
        userId: input.userId,
        orgId: input.orgId,
        kind: input.kind,
        localDate: input.localDate,
      },
    },
    create: {
      userId: input.userId,
      orgId: input.orgId,
      kind: input.kind,
      localDate: input.localDate,
      status: input.status,
      error: input.error,
    },
    update: {
      status: input.status,
      error: input.error ?? null,
    },
  });
}

export type DailyReportSendOptions = {
  /** Dev/test only: send regardless of local 19:00 hour / Sunday gate. */
  ignoreHour?: boolean;
  /** Dev/test only: send even if already delivered for localDate. */
  resend?: boolean;
};

async function sendOne(input: {
  userId: string;
  orgId: string;
  email: string;
  name: string | null;
  kind: DailyReportKind;
  developerId: string | null;
  timeZone: string;
  localDate: string;
  period: DailyReportPeriod;
  resend?: boolean;
}) {
  if (!input.resend && (await alreadyDelivered(input))) return "skipped" as const;
  try {
    const report = await getDailyReportPayload({
      orgId: input.orgId,
      kind: input.kind,
      developerId: input.developerId,
      timeZone: input.timeZone,
      localDate: input.localDate,
      period: input.period,
    });
    await sendDailyReportEmail({
      to: input.email,
      report,
      recipientName: input.name,
    });
    // Idempotency key: personal uses the calendar day; team weekly uses week-end Sunday.
    await recordDelivery({
      userId: input.userId,
      orgId: input.orgId,
      kind: input.kind,
      localDate: report.localDate,
      status: "success",
    });
    return "sent" as const;
  } catch (error) {
    logServerError("daily-report-send", error, {
      userId: input.userId,
      orgId: input.orgId,
      kind: input.kind,
    });
    await recordDelivery({
      userId: input.userId,
      orgId: input.orgId,
      kind: input.kind,
      localDate: input.localDate,
      status: "failed",
      error: error instanceof Error ? error.message.slice(0, 500) : "send failed",
    });
    return "failed" as const;
  }
}

/**
 * Fan out report emails:
 * - Personal: daily at 19:00 local
 * - Team/org: weekly on Sunday at 19:00 local (Mon–Sun numbers)
 */
export async function runDailyReportSend(
  now = new Date(),
  options: DailyReportSendOptions = {},
): Promise<DailyReportSendResult> {
  const { ignoreHour = false, resend = false } = options;
  const memberships = await prisma.organizationMembership.findMany({
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          timeZone: true,
          notificationPreferences: true,
          developerProfiles: {
            where: { removedAt: null },
            select: { id: true, orgId: true },
          },
        },
      },
    },
  });

  const result: DailyReportSendResult = { scanned: memberships.length, due: 0, sent: 0, skipped: 0, failed: 0 };

  for (const membership of memberships) {
    const timeZone = normalizeTimeZone(membership.user.timeZone);
    const dailyDue = ignoreHour || isDueForDailyReport(now, timeZone);
    const weeklyDue = ignoreHour || isDueForWeeklyOrgReport(now, timeZone);
    if (!dailyDue && !weeklyDue) continue;
    result.due += 1;

    const localDate = localDateString(now, timeZone);
    const prefs =
      membership.user.notificationPreferences.find((p) => p.orgId === membership.orgId) ?? null;
    const personalEnabled = prefs?.dailyPersonalEnabled ?? true;
    const orgEnabled = prefs?.dailyOrgEnabled ?? true;
    const developerId =
      membership.user.developerProfiles.find((d) => d.orgId === membership.orgId)?.id ?? null;

    if (dailyDue && personalEnabled && developerId) {
      const outcome = await sendOne({
        userId: membership.user.id,
        orgId: membership.orgId,
        email: membership.user.email,
        name: membership.user.name,
        kind: "personal",
        developerId,
        timeZone,
        localDate,
        period: "day",
        resend,
      });
      result[outcome] += 1;
    }

    if (weeklyDue && orgEnabled && ADMIN_ROLES.has(membership.role)) {
      const { end: weekEnd } = weekRangeEndingOnOrBefore(localDate);
      const outcome = await sendOne({
        userId: membership.user.id,
        orgId: membership.orgId,
        email: membership.user.email,
        name: membership.user.name,
        kind: "org",
        developerId: null,
        timeZone,
        localDate: weekEnd,
        period: "week",
        resend,
      });
      result[outcome] += 1;
    }
  }

  return result;
}
