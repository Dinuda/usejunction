/**
 * Full calculation verification against the e2e fixture.
 * Pins asOf to seed time and walks every calculation-bearing page/view.
 */
import { loadEnvConfig } from "@next/env";
import path from "node:path";
import { writeFileSync } from "node:fs";

loadEnvConfig(path.join(__dirname, "../.."));

import { prisma } from "@usejunction/db";
import {
  getOrgOverview,
  overviewInputFromBounds,
  overviewInputFromRange,
  UTC_TIMEZONE,
  type OverviewInput,
} from "@/lib/insights";
import { getPlanUsage } from "@/lib/insights/queries/get-plan-usage";
import { reportWindowForCycleView, type CycleView } from "@/lib/dashboard/cycle-view";
import { getDashboardUsage } from "@/lib/queries/dashboard/usage";
import { getDashboardTools } from "@/lib/queries/dashboard/tools";
import { getToolDetail } from "@/lib/queries/dashboard/tool-detail";
import { getDeveloperRoster } from "@/lib/read-models/developers";
import { getDeveloperOverview, getMeOverview } from "@/lib/queries/me/overview";
import { listSubscriptions } from "@/lib/tools/subscriptions";
import { getWorkOverview, getWorkActivity } from "@/lib/signals";
import { addCycles, resolveBillingCycleOffset } from "@/lib/billing/cycles";
import {
  activityPriority,
  costKindForRow,
  costPriority,
  isObservedSource,
  normalizeSource,
} from "@/lib/metrics/source-priority";

const ORG_SLUG = "e2e-calculation-fixture";
const NOW = new Date("2026-07-16T12:00:00.000Z");
const DEVELOPER_ID = "e2e-developer";
const MICROS = 1_000_000;
const DAY_MS = 86_400_000;

type Check = {
  surface: string;
  view: string;
  metric: string;
  expected: number | string | boolean | null;
  actual: number | string | boolean | null;
  ok: boolean;
  note?: string;
};

function money(micros: bigint | number) {
  return Number(micros) / MICROS;
}

function roundMoney(n: number) {
  return Math.round(n * 100) / 100;
}

function isoDay(d: Date) {
  return d.toISOString().slice(0, 10);
}

function inWindow(date: Date, from: Date, to: Date) {
  const t = date.getTime();
  return t >= from.getTime() && t <= to.getTime();
}

type RawRow = {
  date: Date;
  developerId: string | null;
  provider: string;
  product: string;
  toolName: string;
  model: string | null;
  source: string;
  verified: boolean;
  requests: number;
  inputTokens: bigint;
  outputTokens: bigint;
  costMicros: bigint;
  costKind: string | null;
};

/** Independently recompute org-wide usage using the same source-priority rules. */
function independentOrgUsage(rows: RawRow[], from: Date, to: Date) {
  const scoped = rows.filter((r) => inWindow(r.date, from, to));

  // Activity: best priority per day/developer/provider/product/tool/model; estimated never counts.
  const activityGroups = new Map<string, RawRow>();
  for (const row of scoped) {
    if (!isObservedSource(normalizeSource(row.source))) continue;
    const key = [
      isoDay(row.date),
      row.developerId ?? "",
      row.provider,
      row.product,
      row.toolName,
      row.model ?? "",
    ].join("|");
    const prev = activityGroups.get(key);
    if (!prev || activityPriority(normalizeSource(row.source)) < activityPriority(normalizeSource(prev.source))) {
      activityGroups.set(key, row);
    }
  }

  // Cost: best priority per day/provider among positive cost rows.
  const costGroups = new Map<string, RawRow>();
  for (const row of scoped) {
    if (row.costMicros <= 0n) continue;
    const key = `${isoDay(row.date)}|${row.provider}`;
    const prev = costGroups.get(key);
    if (!prev || costPriority(normalizeSource(row.source)) < costPriority(normalizeSource(prev.source))) {
      costGroups.set(key, row);
    }
  }

  let requests = 0;
  let tokens = 0n;
  for (const row of activityGroups.values()) {
    requests += row.requests;
    tokens += row.inputTokens + row.outputTokens;
  }

  let verified = 0n;
  let estimated = 0n;
  let actualSpend = 0n;
  for (const row of costGroups.values()) {
    const kind =
      row.costKind ??
      costKindForRow({
        verified: row.verified,
        source: normalizeSource(row.source),
        costMicros: row.costMicros,
      });
    if (kind === "verified_usage") verified += row.costMicros;
    else if (kind === "estimated_api") estimated += row.costMicros;
    else if (kind === "actual_spend") actualSpend += row.costMicros;
  }

  return {
    requests,
    tokens: Number(tokens),
    verified: money(verified),
    estimated: money(estimated),
    actualSpend: money(actualSpend),
    totalUsage: money(verified + estimated + actualSpend),
  };
}

function independentDeveloperUsage(rows: RawRow[], developerId: string, from: Date, to: Date) {
  return independentOrgUsage(
    rows.filter((r) => r.developerId === developerId),
    from,
    to,
  );
}

function independentCursorUsage(rows: RawRow[], from: Date, to: Date) {
  return independentOrgUsage(
    rows.filter((r) => r.toolName === "cursor" || r.provider === "cursor"),
    from,
    to,
  );
}

function overlapDays(fromInclusive: Date, toExclusive: Date, otherFromInclusive: Date, otherToExclusive: Date) {
  const start = new Date(Math.max(fromInclusive.getTime(), otherFromInclusive.getTime()));
  const end = new Date(Math.min(toExclusive.getTime(), otherToExclusive.getTime()));
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / DAY_MS));
}

/** Match getOrgOverview commitment: full cycle for current/previous; overlapping cycle slices for rolling. */
function independentCommitment(
  plans: Awaited<ReturnType<typeof listSubscriptions>>,
  view: CycleView,
  reportWindow: { from: Date; to: Date },
) {
  const toExclusive = new Date(reportWindow.to.getTime() + DAY_MS);
  let total = 0n;
  for (const plan of plans) {
    const fullSpend = plan.cycleSeatMicros * BigInt(plan.seatCapacity);
    if (view !== "last_30_days") {
      total += fullSpend;
      continue;
    }
    let cursor = resolveBillingCycleOffset(plan, reportWindow.from, 0);
    while (cursor.cycleStart < toExclusive) {
      const days = overlapDays(cursor.cycleStart, cursor.cycleEnd, reportWindow.from, toExclusive);
      if (days > 0) {
        total += BigInt(Math.round(Number(fullSpend) * (days / cursor.totalDays)));
      }
      const nextStart = cursor.cycleEnd;
      const nextEnd = addCycles(nextStart, plan.billingCadence, 1, plan.billingCycleDays);
      cursor = {
        cycleStart: nextStart,
        cycleEnd: nextEnd,
        nextRenewalDate: nextEnd,
        elapsedPercent: 1,
        remainingDays: 0,
        totalDays: Math.max(1, Math.round((nextEnd.getTime() - nextStart.getTime()) / DAY_MS)),
      };
    }
  }
  return money(total);
}

function dayOnly(value: string) {
  return value.slice(0, 10);
}

function check(
  surface: string,
  view: string,
  metric: string,
  expected: number | string | boolean | null,
  actual: number | string | boolean | null,
  note?: string,
): Check {
  const normalizedExpected = typeof expected === "string" && /^\d{4}-\d{2}-\d{2}/.test(expected) ? dayOnly(expected) : expected;
  const normalizedActual = typeof actual === "string" && /^\d{4}-\d{2}-\d{2}/.test(actual) ? dayOnly(actual) : actual;
  const ok =
    typeof normalizedExpected === "number" && typeof normalizedActual === "number"
      ? Math.abs(normalizedExpected - normalizedActual) < 0.005
      : normalizedExpected === normalizedActual;
  return { surface, view, metric, expected: normalizedExpected, actual: normalizedActual, ok, note };
}

async function main() {
  const org = await prisma.organization.findUniqueOrThrow({
    where: { slug: ORG_SLUG },
    include: {
      developers: { select: { id: true, name: true, role: true, authUserId: true } },
      devices: { select: { id: true, hostname: true } },
    },
  });
  const owner = org.developers.find((d) => d.role === "owner")!;
  const developer = org.developers.find((d) => d.id === DEVELOPER_ID)!;

  const rawRows = (await prisma.usageDaily.findMany({
    where: { orgId: org.id },
    select: {
      date: true,
      developerId: true,
      provider: true,
      product: true,
      toolName: true,
      model: true,
      source: true,
      verified: true,
      requests: true,
      inputTokens: true,
      outputTokens: true,
      costMicros: true,
      costKind: true,
    },
  })) as RawRow[];

  const plans = await listSubscriptions(org.id);
  const context = {
    orgId: org.id,
    actorId: owner.authUserId ?? "verify",
    roles: ["owner" as const],
    now: NOW,
    timezone: UTC_TIMEZONE,
  };

  const views: Array<{ label: string; cycleView: CycleView; period: { kind: "preset"; days: number } | { kind: "custom"; from: string; to: string }; overviewInput: OverviewInput }> = [
    {
      label: "current_cycles",
      cycleView: "current_cycles",
      period: { kind: "preset", days: 30 },
      overviewInput: { cycleView: "current_cycles" },
    },
    {
      label: "previous_cycles",
      cycleView: "previous_cycles",
      period: { kind: "preset", days: 30 },
      overviewInput: { cycleView: "previous_cycles" },
    },
    {
      label: "last_30_days",
      cycleView: "last_30_days",
      period: { kind: "preset", days: 30 },
      overviewInput: overviewInputFromRange(30, NOW),
    },
    {
      label: "last_14_days",
      cycleView: "last_30_days",
      period: { kind: "preset", days: 14 },
      overviewInput: overviewInputFromRange(14, NOW),
    },
    {
      label: "last_7_days",
      cycleView: "last_30_days",
      period: { kind: "preset", days: 7 },
      overviewInput: overviewInputFromRange(7, NOW),
    },
    {
      label: "custom_2026-07-01_2026-07-16",
      cycleView: "last_30_days",
      period: { kind: "custom", from: "2026-07-01", to: "2026-07-16" },
      overviewInput: overviewInputFromBounds("2026-07-01", "2026-07-16"),
    },
  ];

  const checks: Check[] = [];
  const pageSnapshots: Array<Record<string, unknown>> = [];

  // Raw fixture inventory
  const fixture = {
    asOf: NOW.toISOString(),
    orgSlug: ORG_SLUG,
    orgId: org.id,
    developers: org.developers.length,
    devices: org.devices.length,
    usageRows: rawRows.map((r) => ({
      date: isoDay(r.date),
      developerId: r.developerId,
      tool: r.toolName,
      provider: r.provider,
      source: r.source,
      requests: r.requests,
      tokens: Number(r.inputTokens + r.outputTokens),
      cost: money(r.costMicros),
      costKind: r.costKind,
    })),
    subscriptions: plans.map((p) => ({
      name: p.name,
      toolKey: p.toolKey,
      seatCapacity: p.seatCapacity,
      assignedSeats: p.assignedSeats,
      availableSeats: p.availableSeats,
      cycleSeatDollars: money(p.cycleSeatMicros),
      estimatedCycleDollars: money(p.estimatedCycleMicros),
      cycleStart: isoDay(p.cycle.cycleStart),
      cycleEnd: isoDay(new Date(p.cycle.cycleEnd.getTime() - 86_400_000)),
    })),
  };

  // Static subscription checks
  const cycleCommitment = plans.reduce((sum, p) => sum + money(p.estimatedCycleMicros), 0);
  checks.push(check("/tools subscriptions", "all", "cycleCommitment$", 40, roundMoney(cycleCommitment)));
  checks.push(check("/tools subscriptions", "all", "purchasedSeats", 2, plans.reduce((s, p) => s + p.seatCapacity, 0)));
  checks.push(check("/tools subscriptions", "all", "assignedSeats", 1, plans.reduce((s, p) => s + p.assignedSeats, 0)));
  checks.push(check("/tools subscriptions", "all", "availableSeats", 1, plans.reduce((s, p) => s + p.availableSeats, 0)));

  for (const view of views) {
    const reportWindow = reportWindowForCycleView(view.cycleView, view.period, plans, NOW);
    const indep = independentOrgUsage(rawRows, reportWindow.from, reportWindow.to);
    const cursorIndep = independentCursorUsage(rawRows, reportWindow.from, reportWindow.to);
    const memberIndep = independentDeveloperUsage(rawRows, DEVELOPER_ID, reportWindow.from, reportWindow.to);

    // Dashboard overview
    const overview = await getOrgOverview(context, view.overviewInput);
    const d = overview.data;
    const cursorCycle = d.subscriptionCycles.find((c) => c.toolName === "cursor" || c.toolKey === "cursor");

    checks.push(
      check("/dashboard", view.label, "period.from", isoDay(reportWindow.from), d.period.from),
      check("/dashboard", view.label, "period.to", isoDay(reportWindow.to), d.period.to),
      check("/dashboard", view.label, "kpis.verifiedUsageCost", indep.verified, d.kpis.verifiedUsageCost.value, "org-wide"),
      check("/dashboard", view.label, "kpis.estimatedApiCost", indep.estimated, d.kpis.estimatedApiCost.value, "org-wide"),
      check("/dashboard", view.label, "kpis.tokens", indep.tokens, d.kpis.tokens.value, "org-wide input+output"),
      check(
        "/dashboard",
        view.label,
        "kpis.actualSpend$",
        roundMoney(independentCommitment(plans, view.cycleView, reportWindow)),
        roundMoney(d.kpis.actualSpend.value),
        view.cycleView === "last_30_days" ? "overlap-prorated seat commitment" : "full cycle seatCapacity×price",
      ),
    );

    if (view.label === "previous_cycles") {
      checks.push(
        check("/dashboard", view.label, "cursor.cycleSpend$", 40, cursorCycle?.cycleSpend ?? null),
        check("/dashboard", view.label, "cursor.verified$", 0, cursorCycle?.verifiedUsageCost ?? null, "no June usage in seed"),
        check("/dashboard", view.label, "cursor.modelCalls", 0, cursorCycle?.modelCalls ?? null),
      );
    } else {
      const expectedCursorSpend = roundMoney(independentCommitment(plans, view.cycleView, reportWindow));
      checks.push(
        check("/dashboard", view.label, "cursor.cycleSpend$", expectedCursorSpend, roundMoney(cursorCycle?.cycleSpend ?? NaN)),
        check("/dashboard", view.label, "cursor.verified$", cursorIndep.verified, cursorCycle?.verifiedUsageCost ?? null),
        check("/dashboard", view.label, "cursor.estimated$", cursorIndep.estimated, cursorCycle?.estimatedApiCost ?? null),
        check("/dashboard", view.label, "cursor.modelCalls", cursorIndep.requests, cursorCycle?.modelCalls ?? null),
      );
    }

    // Activity page
    const activity = await getDashboardUsage(org.id, reportWindow);
    checks.push(
      check("/activity", view.label, "modelCalls", indep.requests, activity.kpis.modelCalls),
      check("/activity", view.label, "verifiedUsageCost", indep.verified, activity.kpis.verifiedUsageCost),
      check("/activity", view.label, "estimatedApiCost", indep.estimated, activity.kpis.estimatedApiCost),
      check("/activity", view.label, "tokens", indep.tokens, activity.kpis.inputTokens + activity.kpis.outputTokens),
    );

    // Tools detected tab
    const tools = await getDashboardTools(org.id, reportWindow);
    const cursorTool = tools.tools.find((t) => t.toolName === "cursor");
    checks.push(
      check("/tools activity", view.label, "cursor.requests", cursorIndep.requests, cursorTool?.requests ?? null),
      check("/tools activity", view.label, "cursor.cost$", cursorIndep.totalUsage, cursorTool?.cost ?? null),
      check("/tools activity", view.label, "cursor.tokens", cursorIndep.tokens, cursorTool?.tokens ?? null),
    );

    // Tool detail
    const detail = await getToolDetail(org.id, "cursor", reportWindow);
    checks.push(
      check("/tools/cursor", view.label, "usageCost$", cursorIndep.totalUsage, detail?.kpis.usageCost ?? null),
      check("/tools/cursor", view.label, "requests", cursorIndep.requests, detail?.kpis.requests ?? null),
      check("/tools/cursor", view.label, "tokens", cursorIndep.tokens, detail?.kpis.tokens ?? null),
      check("/tools/cursor", view.label, "seatsPurchased", 2, detail?.kpis.seatsPurchased ?? null),
      check("/tools/cursor", view.label, "seatsAssigned", 1, detail?.kpis.seatsAssigned ?? null),
      check("/tools/cursor", view.label, "devices", 1, detail?.kpis.devices ?? null),
    );

    // Team roster
    const roster = await getDeveloperRoster(org.id, { reportWindow });
    const rosterDev = roster.developers.find((x) => x.id === DEVELOPER_ID);
    checks.push(
      check("/team", view.label, "memberCount", 2, roster.developers.length),
      check("/team", view.label, "e2e-developer.requests", memberIndep.requests, rosterDev?.requests ?? null),
    );

    // Member detail
    const member = await getDeveloperOverview(org.id, DEVELOPER_ID, { reportWindow });
    checks.push(
      check("/team/e2e-developer", view.label, "verified$", memberIndep.verified, member.usage30d.verifiedUsageCost),
      check("/team/e2e-developer", view.label, "estimated$", memberIndep.estimated, member.usage30d.estimatedApiCost),
      check("/team/e2e-developer", view.label, "requests", memberIndep.requests, member.usage30d.requests),
      check(
        "/team/e2e-developer",
        view.label,
        "tokens",
        memberIndep.tokens,
        Number(member.usage30d.inputTokens) + Number(member.usage30d.outputTokens),
      ),
    );

    // Plan usage
    const planUsage = await getPlanUsage(context, { reportWindow });
    checks.push(
      check("/team plan-usage", view.label, "subscriptionCount", 1, planUsage.data.subscriptions.length),
      check("/team plan-usage", view.label, "developersWithAssignments", 1, planUsage.data.developers.length),
    );

    // Signals / work (extraction off)
    const workFilters = {
      from: isoDay(reportWindow.from),
      to: isoDay(reportWindow.to),
    };
    const workOverview = await getWorkOverview(context, workFilters);
    const workActivity = await getWorkActivity(context, { ...workFilters, limit: 50 });
    const workOverviewEnabled = Boolean((workOverview.data as { enabled?: boolean }).enabled);
    const workActivityEnabled = Boolean((workActivity.data as { enabled?: boolean }).enabled);
    const workSessions =
      typeof (workOverview.data as { sessions?: unknown }).sessions === "number"
        ? (workOverview.data as { sessions: number }).sessions
        : Array.isArray((workOverview.data as { sessions?: unknown[] }).sessions)
          ? (workOverview.data as { sessions: unknown[] }).sessions.length
          : 0;
    checks.push(
      check("/signals", view.label, "enabled", false, workOverviewEnabled),
      check("/signals/activity", view.label, "enabled", false, workActivityEnabled),
      check("/signals", view.label, "sessions", 0, workSessions, "work extraction off"),
    );

    pageSnapshots.push({
      view: view.label,
      window: { from: isoDay(reportWindow.from), to: isoDay(reportWindow.to) },
      independent: { org: indep, cursor: cursorIndep, member: memberIndep },
      dashboard: {
        cycleView: d.cycleView,
        period: d.period,
        kpis: {
          commitment: d.kpis.actualSpend.value,
          verified: d.kpis.verifiedUsageCost.value,
          estimated: d.kpis.estimatedApiCost.value,
          tokens: d.kpis.tokens.value,
        },
        coverage: d.coverage,
        subscriptionCycles: d.subscriptionCycles,
        tools: d.tools,
        hasActivity: d.hasActivity,
        observation: d.observation,
      },
      activity: {
        modelCalls: activity.kpis.modelCalls,
        verified: activity.kpis.verifiedUsageCost,
        estimated: activity.kpis.estimatedApiCost,
        tokens: activity.kpis.inputTokens + activity.kpis.outputTokens,
        byTool: activity.byTool,
      },
      toolsDetected: tools.tools.map((t) => ({
        name: t.toolName,
        requests: t.requests,
        cost: t.cost,
        tokens: t.tokens,
        installedOn: t.installedOn,
      })),
      toolCursor: detail
        ? {
            usageCost: detail.kpis.usageCost,
            requests: detail.kpis.requests,
            tokens: detail.kpis.tokens,
            devices: detail.kpis.devices,
            people: detail.kpis.people,
            seatsPurchased: detail.kpis.seatsPurchased,
            seatsAssigned: detail.kpis.seatsAssigned,
          }
        : null,
      team: {
        members: roster.developers.map((x) => ({
          id: x.id,
          name: x.name,
          requests: x.requests,
          cost: x.cost,
        })),
      },
      member: {
        verified: member.usage30d.verifiedUsageCost,
        estimated: member.usage30d.estimatedApiCost,
        requests: member.usage30d.requests,
        tokens: Number(member.usage30d.inputTokens) + Number(member.usage30d.outputTokens),
      },
      signals: {
        overviewEnabled: workOverviewEnabled,
        activityEnabled: workActivityEnabled,
      },
    });
  }

  // Developer personal surfaces (fixed 30d / me overview)
  const me = await getMeOverview(org.id, developer.authUserId!, "user");
  const meWindow = reportWindowForCycleView("last_30_days", { kind: "preset", days: 30 }, plans, NOW);
  const meIndep = independentDeveloperUsage(rawRows, DEVELOPER_ID, meWindow.from, meWindow.to);
  checks.push(
    check("/dashboard (developer)", "last_30_days", "requests", meIndep.requests, me.usage30d.requests),
    check("/dashboard (developer)", "last_30_days", "verified$", meIndep.verified, me.usage30d.verifiedUsageCost),
    check("/activity (developer)", "last_30_days", "estimated$", meIndep.estimated, me.usage30d.estimatedApiCost),
    check(
      "/activity (developer)",
      "last_30_days",
      "tokens",
      meIndep.tokens,
      Number(me.usage30d.inputTokens) + Number(me.usage30d.outputTokens),
    ),
  );

  const passed = checks.filter((c) => c.ok).length;
  const failed = checks.filter((c) => !c.ok);
  const skipped = checks.filter((c) => c.expected === null && c.actual === null);

  const report = {
    generatedAt: new Date().toISOString(),
    asOf: NOW.toISOString(),
    fixture,
    summary: {
      totalChecks: checks.length,
      passed,
      failed: failed.length,
      skippedNull: skipped.length,
      views: views.map((v) => v.label),
      surfaces: [...new Set(checks.map((c) => c.surface))],
    },
    failures: failed,
    checks,
    pageSnapshots,
  };

  const outPath = path.join(__dirname, "calculation-verification-report.json");
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify(
      {
        outPath,
        summary: report.summary,
        failureCount: failed.length,
        failures: failed.slice(0, 30),
      },
      null,
      2,
    ),
  );

  if (failed.length) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
