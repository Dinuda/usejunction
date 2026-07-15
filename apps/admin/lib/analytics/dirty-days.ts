import { prisma } from "@usejunction/db";
import {
  ANALYTICS_KIND_METRIC_DAILY,
  METRIC_VERSION,
} from "@/lib/analytics/metric-version";
import { utcDateOnly } from "@/lib/metrics/date-range";

/** Mark calendar day(s) dirty so the materializer rematerializes only those days. */
export async function markAnalyticsDirtyDays(input: {
  orgId: string;
  dates: Date[];
  metricVersion?: string;
}) {
  const metricVersion = input.metricVersion ?? METRIC_VERSION;
  const unique = new Map<string, Date>();
  for (const date of input.dates) {
    const day = utcDateOnly(date);
    unique.set(day.toISOString().slice(0, 10), day);
  }
  if (unique.size === 0) return;

  await prisma.$transaction(
    Array.from(unique.values()).map((date) =>
      prisma.analyticsDirtyDay.upsert({
        where: {
          orgId_date_metricVersion: {
            orgId: input.orgId,
            date,
            metricVersion,
          },
        },
        create: {
          orgId: input.orgId,
          date,
          metricVersion,
        },
        update: { markedAt: new Date() },
      }),
    ),
  );
}

export async function markAnalyticsDirtyDay(orgId: string, date: Date, metricVersion = METRIC_VERSION) {
  await markAnalyticsDirtyDays({ orgId, dates: [date], metricVersion });
}

export async function getAnalyticsWatermark(orgId: string, metricVersion = METRIC_VERSION) {
  return prisma.analyticsWatermark.findUnique({
    where: {
      orgId_kind_metricVersion: {
        orgId,
        kind: ANALYTICS_KIND_METRIC_DAILY,
        metricVersion,
      },
    },
  });
}
