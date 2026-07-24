import { prisma } from "@usejunction/db";
import type { MetricWindow } from "@/lib/analytics/contracts/time-window";
import {
  ORG_DAY_SNAPSHOT_VERSION,
  ensureOrgUsageDaySnapshots,
  snapshotEachDay,
  snapshotIsoDay,
  snapshotUtcDay,
} from "./materialize";
import {
  OVERLAY_LIVE_DIRTY_DAY_CAP,
  eachIsoDayInclusive,
  liveOrgDayTotalsForDates,
  loadDirtyDaysInWindow,
  orgLiveRowsForRead,
  splitLiveReadWindow,
  type LiveDayTotalRow,
} from "./overlay";

export type SnapshotDayTotals = {
  date: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  verifiedUsageCost: number;
  estimatedApiCost: number;
  actualSpendCost: number;
  activeDevelopers: number;
  activeDeveloperIds: string[];
  dataThrough: Date | null;
};

export type SnapshotToolTotals = {
  toolName: string;
  requests: number;
  cost: number;
  verifiedUsageCost: number;
  estimatedApiCost: number;
  activeDevelopers: number;
};

export type SnapshotToolDay = {
  date: string;
  toolName: string;
  requests: number;
  verifiedUsageCost: number;
  estimatedApiCost: number;
};

function microsToDollars(value: bigint | number) {
  return Number(value) / 1_000_000;
}

function parseIds(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  return [];
}

/**
 * Read-path seal for one developer's day totals: stub missing days with zeros.
 * Does not rematerialize — Sync / cron own freshness.
 */
export async function ensureDeveloperUsageDaySnapshots(
  orgId: string,
  developerId: string,
  from: Date,
  to: Date,
  options: { metricVersion?: string } = {},
): Promise<{ stubbed: number }> {
  if (!developerId) return { stubbed: 0 };
  const metricVersion = options.metricVersion ?? ORG_DAY_SNAPSHOT_VERSION;
  const fromDay = snapshotUtcDay(from);
  const toDay = snapshotUtcDay(to);

  const existing = await prisma.orgUsageDaySnapshot.findMany({
    where: {
      orgId,
      metricVersion,
      toolName: "",
      developerId,
      date: { gte: fromDay, lte: toDay },
    },
    select: { date: true },
  });
  const have = new Set(existing.map((row) => snapshotIsoDay(row.date)));
  const missing = snapshotEachDay(fromDay, toDay).filter((day) => !have.has(snapshotIsoDay(day)));
  if (!missing.length) return { stubbed: 0 };

  const now = new Date();
  await prisma.orgUsageDaySnapshot.createMany({
    data: missing.map((day) => ({
      orgId,
      date: day,
      toolName: "",
      developerId,
      metricVersion,
      requests: 0,
      inputTokens: BigInt(0),
      outputTokens: BigInt(0),
      verifiedUsageCostMicros: BigInt(0),
      estimatedApiCostMicros: BigInt(0),
      actualSpendCostMicros: BigInt(0),
      activeDevelopers: 0,
      activeDeveloperIds: [],
      computedAt: now,
      sourceObservedThrough: null,
    })),
    skipDuplicates: true,
  });
  return { stubbed: missing.length };
}

type SnapshotReadResult = {
  dataThrough: Date | null;
  kpis: {
    modelCalls: number;
    tokens: number;
    verifiedUsageCost: number;
    estimatedApiCost: number;
    partialData: boolean;
  };
  trend: Array<{ date: string; modelCalls: number; cost: number }>;
  tools: SnapshotToolTotals[];
  activeDevelopers: number;
  toolDays: SnapshotToolDay[];
  dayTotals: SnapshotDayTotals[];
};

function foldSnapshotRows(
  rows: Array<{
    date: Date;
    toolName: string;
    requests: number;
    inputTokens: bigint;
    outputTokens: bigint;
    verifiedUsageCostMicros: bigint;
    estimatedApiCostMicros: bigint;
    actualSpendCostMicros: bigint;
    activeDevelopers: number;
    activeDeveloperIds: unknown;
    sourceObservedThrough: Date | null;
  }>,
  options: { includeTools?: boolean; toolNames?: string[]; partialData?: boolean; importingDays?: number },
): SnapshotReadResult {
  const dayTotals: SnapshotDayTotals[] = [];
  const toolAcc = new Map<string, SnapshotToolTotals>();
  const toolDays: SnapshotToolDay[] = [];
  const windowDeveloperIds = new Set<string>();
  let dataThrough: Date | null = null;

  for (const row of rows) {
    const date = snapshotIsoDay(row.date);
    const verified = microsToDollars(row.verifiedUsageCostMicros);
    const estimated = microsToDollars(row.estimatedApiCostMicros);
    if (row.sourceObservedThrough && (!dataThrough || row.sourceObservedThrough > dataThrough)) {
      dataThrough = row.sourceObservedThrough;
    }

    if (row.toolName === "") {
      const ids = parseIds(row.activeDeveloperIds);
      for (const id of ids) windowDeveloperIds.add(id);
      dayTotals.push({
        date,
        requests: row.requests,
        inputTokens: Number(row.inputTokens),
        outputTokens: Number(row.outputTokens),
        verifiedUsageCost: verified,
        estimatedApiCost: estimated,
        actualSpendCost: microsToDollars(row.actualSpendCostMicros),
        activeDevelopers: row.activeDevelopers,
        activeDeveloperIds: ids,
        dataThrough: row.sourceObservedThrough,
      });
      continue;
    }

    if (options.toolNames?.length && !options.toolNames.includes(row.toolName)) continue;

    toolDays.push({
      date,
      toolName: row.toolName,
      requests: row.requests,
      verifiedUsageCost: verified,
      estimatedApiCost: estimated,
    });

    if (options.includeTools) {
      const existing = toolAcc.get(row.toolName) ?? {
        toolName: row.toolName,
        requests: 0,
        cost: 0,
        verifiedUsageCost: 0,
        estimatedApiCost: 0,
        activeDevelopers: 0,
      };
      existing.requests += row.requests;
      existing.verifiedUsageCost += verified;
      existing.estimatedApiCost += estimated;
      existing.cost += verified + estimated;
      existing.activeDevelopers = Math.max(existing.activeDevelopers, row.activeDevelopers);
      toolAcc.set(row.toolName, existing);
    }
  }

  if (options.includeTools) {
    const toolDevIds = new Map<string, Set<string>>();
    for (const row of rows) {
      if (row.toolName === "") continue;
      if (options.toolNames?.length && !options.toolNames.includes(row.toolName)) continue;
      const set = toolDevIds.get(row.toolName) ?? new Set<string>();
      for (const id of parseIds(row.activeDeveloperIds)) set.add(id);
      toolDevIds.set(row.toolName, set);
    }
    for (const [toolName, ids] of toolDevIds) {
      const tool = toolAcc.get(toolName);
      if (tool && ids.size > 0) tool.activeDevelopers = ids.size;
    }
  }

  const kpis = {
    modelCalls: dayTotals.reduce((sum, row) => sum + row.requests, 0),
    tokens: dayTotals.reduce((sum, row) => sum + row.inputTokens + row.outputTokens, 0),
    verifiedUsageCost: dayTotals.reduce((sum, row) => sum + row.verifiedUsageCost, 0),
    estimatedApiCost: dayTotals.reduce((sum, row) => sum + row.estimatedApiCost, 0),
    partialData: Boolean(options.partialData) || (options.importingDays ?? 0) > 0,
  };

  return {
    dataThrough,
    kpis,
    trend: dayTotals.map((row) => ({
      date: row.date,
      modelCalls: row.requests,
      cost: row.verifiedUsageCost + row.estimatedApiCost,
    })),
    tools: options.includeTools ? [...toolAcc.values()] : [],
    activeDevelopers: windowDeveloperIds.size,
    toolDays,
    dayTotals,
  };
}

/**
 * Sum ready org-day snapshots for a window (`developerId = ""` rollups only).
 * Recent-horizon days always come from live usage_daily so first-sync KPIs are
 * correct even when sealed snapshots are stale or zero. Older days use sealed
 * snapshots with a dirty-day overlay.
 */
export async function readOrgUsageFromSnapshots(
  orgId: string,
  window: MetricWindow,
  options: { includeTools?: boolean; toolNames?: string[]; ensure?: boolean } = {},
): Promise<SnapshotReadResult> {
  const from = snapshotUtcDay(window.from);
  const to = snapshotUtcDay(window.to);
  const { historyFrom, historyTo, liveFrom, liveTo } = splitLiveReadWindow(from, to);

  if (options.ensure !== false && historyFrom && historyTo) {
    await ensureOrgUsageDaySnapshots(orgId, historyFrom, historyTo);
  }

  type MergedRow = {
    date: Date;
    toolName: string;
    requests: number;
    inputTokens: bigint;
    outputTokens: bigint;
    verifiedUsageCostMicros: bigint;
    estimatedApiCostMicros: bigint;
    actualSpendCostMicros: bigint;
    activeDevelopers: number;
    activeDeveloperIds: unknown;
    sourceObservedThrough: Date | null;
  };

  let historyRows: MergedRow[] = [];
  let deferredDirty: string[] = [];
  let liveDirtyOverlay = false;

  if (historyFrom && historyTo) {
    const dirtyDays = await loadDirtyDaysInWindow(orgId, historyFrom, historyTo);
    const liveDirty = dirtyDays.slice(0, OVERLAY_LIVE_DIRTY_DAY_CAP);
    deferredDirty = dirtyDays.slice(OVERLAY_LIVE_DIRTY_DAY_CAP);
    const dirtySet = new Set(dirtyDays);

    const rows = await prisma.orgUsageDaySnapshot.findMany({
      where: {
        orgId,
        developerId: "",
        metricVersion: ORG_DAY_SNAPSHOT_VERSION,
        date: { gte: historyFrom, lte: historyTo },
        ...(options.toolNames?.length
          ? { OR: [{ toolName: "" }, { toolName: { in: options.toolNames } }] }
          : {}),
      },
      orderBy: [{ date: "asc" }, { toolName: "asc" }],
    });

    const cleanRows = rows.filter((row) => !dirtySet.has(snapshotIsoDay(row.date)));
    historyRows = cleanRows;
    if (liveDirty.length) {
      liveDirtyOverlay = true;
      const live = await liveOrgDayTotalsForDates(orgId, liveDirty);
      const liveOrg = orgLiveRowsForRead(live);
      historyRows = [...cleanRows, ...liveOrg];
    }
  }

  let liveRows: LiveDayTotalRow[] = [];
  if (liveFrom && liveTo) {
    const liveDays = eachIsoDayInclusive(liveFrom, liveTo);
    const live = await liveOrgDayTotalsForDates(orgId, liveDays);
    liveRows = orgLiveRowsForRead(live);
  }

  return foldSnapshotRows([...historyRows, ...liveRows], {
    ...options,
    partialData: deferredDirty.length > 0 || liveDirtyOverlay,
    importingDays: deferredDirty.length,
  });
}

/**
 * Sum sealed developer-day snapshots for You / member dashboards.
 * Same live-horizon + dirty-aware overlay as org rollups.
 */
export async function readDeveloperUsageFromSnapshots(
  orgId: string,
  developerId: string,
  window: MetricWindow,
  options: { includeTools?: boolean; toolNames?: string[]; ensure?: boolean } = {},
): Promise<SnapshotReadResult> {
  const from = snapshotUtcDay(window.from);
  const to = snapshotUtcDay(window.to);
  const { historyFrom, historyTo, liveFrom, liveTo } = splitLiveReadWindow(from, to);

  if (options.ensure !== false && historyFrom && historyTo) {
    await ensureOrgUsageDaySnapshots(orgId, historyFrom, historyTo);
    await ensureDeveloperUsageDaySnapshots(orgId, developerId, historyFrom, historyTo);
  }

  type MergedRow = {
    date: Date;
    toolName: string;
    requests: number;
    inputTokens: bigint;
    outputTokens: bigint;
    verifiedUsageCostMicros: bigint;
    estimatedApiCostMicros: bigint;
    actualSpendCostMicros: bigint;
    activeDevelopers: number;
    activeDeveloperIds: unknown;
    sourceObservedThrough: Date | null;
  };

  let historyRows: MergedRow[] = [];
  let deferredDirty: string[] = [];
  let liveDirtyOverlay = false;

  if (historyFrom && historyTo) {
    const dirtyDays = await loadDirtyDaysInWindow(orgId, historyFrom, historyTo);
    const liveDirty = dirtyDays.slice(0, OVERLAY_LIVE_DIRTY_DAY_CAP);
    deferredDirty = dirtyDays.slice(OVERLAY_LIVE_DIRTY_DAY_CAP);
    const dirtySet = new Set(dirtyDays);

    const rows = await prisma.orgUsageDaySnapshot.findMany({
      where: {
        orgId,
        developerId,
        metricVersion: ORG_DAY_SNAPSHOT_VERSION,
        date: { gte: historyFrom, lte: historyTo },
        ...(options.toolNames?.length
          ? { OR: [{ toolName: "" }, { toolName: { in: options.toolNames } }] }
          : {}),
      },
      orderBy: [{ date: "asc" }, { toolName: "asc" }],
    });

    const cleanRows = rows.filter((row) => !dirtySet.has(snapshotIsoDay(row.date)));
    historyRows = cleanRows;
    if (liveDirty.length) {
      liveDirtyOverlay = true;
      const live = await liveOrgDayTotalsForDates(orgId, liveDirty, { developerId });
      const liveDev = live.filter((row) => row.developerId === developerId || row.developerId === "");
      const byKey = new Map<string, (typeof live)[number]>();
      for (const row of liveDev) {
        const key = `${snapshotIsoDay(row.date)}|${row.toolName}|${row.developerId}`;
        if (
          row.developerId === developerId ||
          !byKey.has(`${snapshotIsoDay(row.date)}|${row.toolName}|${developerId}`)
        ) {
          byKey.set(key, row);
        }
      }
      const preferred = [...byKey.values()].filter((row) => row.developerId === developerId);
      historyRows = [
        ...cleanRows,
        ...(preferred.length ? preferred : liveDev.filter((r) => r.toolName === "" && r.developerId === "")),
      ];
    }
  }

  let liveRows: LiveDayTotalRow[] = [];
  if (liveFrom && liveTo) {
    const liveDays = eachIsoDayInclusive(liveFrom, liveTo);
    const live = await liveOrgDayTotalsForDates(orgId, liveDays, { developerId });
    const liveDev = live.filter((row) => row.developerId === developerId);
    liveRows =
      liveDev.length > 0
        ? liveDev
        : live.filter((row) => row.toolName === "" && row.developerId === "");
  }

  return foldSnapshotRows([...historyRows, ...liveRows], {
    ...options,
    partialData: deferredDirty.length > 0 || liveDirtyOverlay,
    importingDays: deferredDirty.length,
  });
}
