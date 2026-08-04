import { loadEnvConfig } from "@next/env";
import path from "node:path";

loadEnvConfig(path.join(__dirname, "../.."));

import { prisma } from "@usejunction/db";
import { getDailyReportPayload, priorDayDeltaPct } from "../lib/reports/daily-report";
import { readDailyReportUsageSnapshot, captureDailyReportUsageSnapshot } from "../lib/reports/send-time-snapshot";
import { readCanonicalReportUsage } from "../lib/reports/canonical-usage";
import { addLocalDays } from "../lib/timezone";

async function main() {
  const devs = await prisma.developer.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      orgId: true,
      authUserId: true,
      organization: { select: { name: true, slug: true } },
    },
    orderBy: { createdAt: "asc" },
    take: 20,
  });

  const dinuda =
    devs.find((d) => /dinuda/i.test(d.name ?? "") || /dinuda/i.test(d.email ?? "")) ?? devs[0];
  if (!dinuda) {
    console.log("No developers found in local DB");
    return;
  }

  const user = dinuda.authUserId
    ? await prisma.user.findUnique({
        where: { id: dinuda.authUserId },
        select: { timeZone: true },
      })
    : null;
  const timeZone = user?.timeZone ?? "Asia/Colombo";
  const localDate = "2026-08-01";
  const previousDate = addLocalDays(localDate, -1);
  const now = new Date("2026-08-01T14:30:00.000Z"); // 20:00 Asia/Colombo

  let priorSnapshot = await readDailyReportUsageSnapshot({
    orgId: dinuda.orgId,
    developerId: dinuda.id,
    localDate: previousDate,
  });

  const today = await readCanonicalReportUsage({
    orgId: dinuda.orgId,
    developerId: dinuda.id,
    fromLocalDate: localDate,
    toLocalDate: localDate,
  });

  const friday = await readCanonicalReportUsage({
    orgId: dinuda.orgId,
    developerId: dinuda.id,
    fromLocalDate: previousDate,
    toLocalDate: previousDate,
  });

  let seededSnapshot = false;
  if (!priorSnapshot && friday.tokens > 0) {
    await captureDailyReportUsageSnapshot({
      orgId: dinuda.orgId,
      developerId: dinuda.id,
      localDate: previousDate,
      totals: { tokens: friday.tokens, cost: friday.cost, requests: friday.requests },
      capturedAt: now,
    });
    priorSnapshot = await readDailyReportUsageSnapshot({
      orgId: dinuda.orgId,
      developerId: dinuda.id,
      localDate: previousDate,
    });
    seededSnapshot = true;
  }

  const report = await getDailyReportPayload({
      orgId: dinuda.orgId,
      kind: "personal",
      developerId: dinuda.id,
      timeZone,
      localDate,
      now,
    });

  const manual = priorSnapshot ? priorDayDeltaPct(priorSnapshot.tokens, today.tokens) : null;
  const inverted =
    priorSnapshot && today.tokens > 0
      ? ((priorSnapshot.tokens - today.tokens) / today.tokens) * 100
      : null;
  const wowToday = report.wowStrip?.cells.find((c) => c.isToday);

  const result = {
    developer: { name: dinuda.name, email: dinuda.email, org: dinuda.organization.slug },
    localDate,
    previousDate,
    fridayFullDayTokens: friday.tokens,
    seededSnapshot,
    todayTokens: today.tokens,
    priorSnapshotTokens: priorSnapshot?.tokens ?? null,
    reportKpiDelta: report.kpis.tokensDeltaPct,
    manualDelta: manual,
    oldInvertedBug: inverted != null ? Math.round(inverted) : null,
    wowStripTodayDelta: wowToday?.deltaPct ?? null,
    kpiMatchesManual: report.kpis.tokensDeltaPct === manual,
    kpiMatchesWowStrip: report.kpis.tokensDeltaPct === wowToday?.deltaPct,
    wowStripCells: report.wowStrip?.cells.map((c) => ({
      label: c.label,
      date: c.localDate,
      tokens: c.tokens,
      priorTokens: c.priorTokens,
      deltaPct: c.deltaPct,
      isToday: c.isToday,
    })),
    headline:
      report.kpis.tokensDeltaPct != null
        ? `${report.kpis.tokensDeltaPct >= 0 ? "+" : ""}${report.kpis.tokensDeltaPct.toFixed(0)}% tokens vs yesterday`
        : null,
  };

  console.log(JSON.stringify(result, null, 2));

  if (result.kpiMatchesManual && result.reportKpiDelta !== result.oldInvertedBug) {
    console.log("\nPASS: KPI delta matches manual formula and differs from old inverted bug");
  } else {
    console.log("\nCHECK: Review output above");
    process.exitCode = 1;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
