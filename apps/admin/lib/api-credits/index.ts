import { prisma, type ApiCreditPool } from "@usejunction/db";
import { resolveBillingCycle } from "@/lib/billing/cycles";
import { estimateCost } from "@/lib/metrics/estimate-cost";

const DAY_MS = 86_400_000;

function utcDay(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function addDay(value: Date) {
  return new Date(value.getTime() + DAY_MS);
}

export function resolveCreditPeriod(pool: Pick<ApiCreditPool, "mode" | "billingCadence" | "billingCycleAnchorDate" | "billingCycleDays" | "grantStartDate" | "expiresAt" | "createdAt">, now = new Date()) {
  if (pool.mode === "fixed") {
    const start = utcDay(pool.grantStartDate ?? pool.createdAt);
    const configuredEnd = pool.expiresAt ? utcDay(pool.expiresAt) : null;
    return { start, end: configuredEnd ?? addDay(utcDay(now)), expiresAt: configuredEnd, recurring: false };
  }
  const cycle = resolveBillingCycle({
    billingCadence: pool.billingCadence ?? "monthly",
    billingCycleAnchorDate: pool.billingCycleAnchorDate,
    billingCycleDays: pool.billingCycleDays,
    createdAt: pool.createdAt,
  }, now);
  return { start: cycle.cycleStart, end: cycle.cycleEnd, expiresAt: cycle.cycleEnd, recurring: true };
}

function microsForRow(row: { costMicros: bigint; model: string; inputTokens: bigint; outputTokens: bigint; cacheReadTokens: bigint; cacheWriteTokens: bigint; toolName: string }) {
  if (row.costMicros > BigInt(0)) return row.costMicros;
  return BigInt(Math.max(0, Math.round(estimateCost(
    row.model,
    Number(row.inputTokens),
    Number(row.outputTokens),
    Number(row.cacheReadTokens),
    Number(row.cacheWriteTokens),
    row.toolName,
  ) * 1_000_000)));
}

function isoDay(value: Date) {
  return value.toISOString().slice(0, 10);
}

export function calculateCreditBalance(input: {
  budgetMicros: bigint;
  verifiedSpentMicros: bigint;
  pendingEstimatedMicros: bigint;
  fallbackEstimatedMicros: bigint;
  hasVerified: boolean;
  periodStart: Date;
  now: Date;
  spendDays: number;
}) {
  const projectedSpentMicros = input.hasVerified
    ? input.verifiedSpentMicros + input.pendingEstimatedMicros
    : input.fallbackEstimatedMicros + input.pendingEstimatedMicros;
  const verifiedRemainingMicros = input.hasVerified ? input.budgetMicros - input.verifiedSpentMicros : null;
  const projectedRemainingMicros = input.budgetMicros - projectedSpentMicros;
  const rawRatio = input.budgetMicros > BigInt(0) ? Number(projectedSpentMicros) / Number(input.budgetMicros) : 0;
  const elapsedDays = Math.max(1, Math.floor((utcDay(input.now).getTime() - input.periodStart.getTime()) / DAY_MS) + 1);
  let projectedExhaustionAt: Date | null = null;
  if (input.spendDays >= 3 && projectedSpentMicros > BigInt(0)) {
    const daily = Number(projectedSpentMicros) / elapsedDays;
    projectedExhaustionAt = new Date(input.periodStart.getTime() + Math.ceil(Number(input.budgetMicros) / daily) * DAY_MS);
  }
  return { projectedSpentMicros, verifiedRemainingMicros, projectedRemainingMicros, rawRatio, displayRatio: Math.max(0, Math.min(rawRatio, 1)), projectedExhaustionAt };
}

export async function readApiCreditPool(pool: ApiCreditPool & { connection: {
  id: string; status: string; permissions: unknown; lastSyncedAt: Date | null; lastCostSyncedAt: Date | null; costDataThrough: Date | null; lastError: string | null;
} }, now = new Date()) {
  const period = resolveCreditPeriod(pool, now);
  const end = period.end < now ? period.end : addDay(utcDay(now));
  const [verifiedRows, vendorUsageRows, gatewayRows] = await Promise.all([
    prisma.usageDaily.findMany({
      where: { connectionId: pool.connectionId, source: "vendor_verified", date: { gte: period.start, lt: end }, costMicros: { gt: BigInt(0) } },
      select: { date: true, costMicros: true },
    }),
    prisma.usageDaily.findMany({
      where: { connectionId: pool.connectionId, source: "vendor_verified", date: { gte: period.start, lt: end }, OR: [{ requests: { gt: 0 } }, { inputTokens: { gt: BigInt(0) } }, { outputTokens: { gt: BigInt(0) } }] },
      select: { date: true, costMicros: true, model: true, inputTokens: true, outputTokens: true, cacheReadTokens: true, cacheWriteTokens: true, toolName: true },
    }),
    prisma.usageDaily.findMany({
      where: { orgId: pool.orgId, provider: pool.provider, source: "gateway_observed", date: { gte: period.start, lt: end } },
      select: { date: true, observedAt: true, costMicros: true, model: true, inputTokens: true, outputTokens: true, cacheReadTokens: true, cacheWriteTokens: true, toolName: true },
    }),
  ]);
  const verifiedSpent = verifiedRows.reduce((sum, row) => sum + row.costMicros, BigInt(0));
  const pendingCutoff = pool.connection.lastCostSyncedAt;
  const pendingRows = gatewayRows.filter((row) => !pendingCutoff || row.observedAt > pendingCutoff);
  const pendingEstimated = pendingRows.reduce((sum, row) => sum + microsForRow(row), BigInt(0));
  const gatewayEstimated = gatewayRows.reduce((sum, row) => sum + microsForRow(row), BigInt(0));
  const vendorEstimated = vendorUsageRows.reduce((sum, row) => sum + microsForRow(row), BigInt(0));
  const costAccessAvailable = Array.isArray(pool.connection.permissions) && pool.connection.permissions.includes("organization_costs:read");
  const hasVerified = pool.connection.lastCostSyncedAt != null && costAccessAvailable;
  // Without provider cost permission, vendor usage is the broadest estimate but
  // generally includes calls also seen by the gateway. Keep only its residual so
  // the gateway estimate can be displayed separately without double-counting it.
  const canonicalEstimate = vendorEstimated > gatewayEstimated ? vendorEstimated : gatewayEstimated;
  const fallbackResidualEstimate = canonicalEstimate > pendingEstimated ? canonicalEstimate - pendingEstimated : BigInt(0);
  const spendDays = new Set([
    ...verifiedRows.filter((row) => row.costMicros > BigInt(0)).map((row) => isoDay(row.date)),
    ...vendorUsageRows.map((row) => isoDay(row.date)),
    ...pendingRows.map((row) => isoDay(row.date)),
  ]).size;
  const balance = calculateCreditBalance({ budgetMicros: pool.budgetMicros, verifiedSpentMicros: verifiedSpent, pendingEstimatedMicros: pendingEstimated, fallbackEstimatedMicros: fallbackResidualEstimate, hasVerified, periodStart: period.start, now, spendDays });
  return {
    id: pool.id,
    connectionId: pool.connectionId,
    provider: pool.provider,
    product: pool.product,
    name: pool.name,
    mode: pool.mode,
    currency: pool.currency,
    budgetMicros: pool.budgetMicros.toString(),
    billingCadence: pool.billingCadence,
    billingCycleAnchorDate: pool.billingCycleAnchorDate?.toISOString().slice(0, 10) ?? null,
    billingCycleDays: pool.billingCycleDays,
    grantStartDate: pool.grantStartDate?.toISOString().slice(0, 10) ?? null,
    expiresAt: pool.expiresAt?.toISOString().slice(0, 10) ?? null,
    active: pool.active,
    period: { start: isoDay(period.start), end: isoDay(period.end) },
    verifiedSpentMicros: hasVerified ? verifiedSpent.toString() : null,
    pendingEstimatedMicros: pendingEstimated.toString(),
    projectedSpentMicros: balance.projectedSpentMicros.toString(),
    verifiedRemainingMicros: balance.verifiedRemainingMicros?.toString() ?? null,
    projectedRemainingMicros: balance.projectedRemainingMicros.toString(),
    rawRatio: balance.rawRatio,
    displayRatio: balance.displayRatio,
    projectedExhaustionAt: balance.projectedExhaustionAt?.toISOString() ?? null,
    spendDays,
    connection: {
      status: pool.connection.status,
      lastSyncedAt: pool.connection.lastSyncedAt?.toISOString() ?? null,
      lastCostSyncedAt: pool.connection.lastCostSyncedAt?.toISOString() ?? null,
      costDataThrough: pool.connection.costDataThrough?.toISOString() ?? null,
      costAccessAvailable,
      degraded: Boolean(pool.connection.lastError),
    },
  };
}

export async function listApiCreditPools(orgId: string, now = new Date(), includeInactive = false) {
  const pools = await prisma.apiCreditPool.findMany({
    where: { orgId, ...(includeInactive ? {} : { active: true }) },
    include: { connection: { select: { id: true, status: true, permissions: true, lastSyncedAt: true, lastCostSyncedAt: true, costDataThrough: true, lastError: true } } },
    orderBy: [{ provider: "asc" }, { createdAt: "asc" }],
  });
  return Promise.all(pools.map((pool) => readApiCreditPool(pool, now)));
}

type GroupBy = "developer" | "api_key" | "project" | "model";

export async function readApiCreditUsage(orgId: string, poolId: string, groupBy: GroupBy, now = new Date()) {
  const pool = await prisma.apiCreditPool.findFirst({ where: { id: poolId, orgId }, include: { connection: true } });
  if (!pool) return null;
  const period = resolveCreditPeriod(pool, now);
  const [vendorRows, gatewayRows, keys, developers] = await Promise.all([
    prisma.usageDaily.findMany({ where: { connectionId: pool.connectionId, source: "vendor_verified", date: { gte: period.start, lt: period.end } } }),
    prisma.usageDaily.findMany({ where: { orgId, provider: pool.provider, source: "gateway_observed", date: { gte: period.start, lt: period.end } } }),
    prisma.providerApiKey.findMany({ where: { connectionId: pool.connectionId }, select: { id: true, externalKeyId: true, name: true, projectId: true, workspaceId: true, developerId: true, mappingSource: true, status: true } }),
    prisma.developer.findMany({ where: { orgId }, select: { id: true, name: true, email: true } }),
  ]);
  const keyByExternal = new Map(keys.map((key) => [key.externalKeyId, key]));
  const developerById = new Map(developers.map((developer) => [developer.id, developer]));
  const verifiedAvailable = pool.connection.lastCostSyncedAt != null
    && Array.isArray(pool.connection.permissions)
    && pool.connection.permissions.includes("organization_costs:read");
  const verifiedByDay = new Map<string, bigint>();
  if (verifiedAvailable) for (const row of vendorRows) if (row.costMicros > BigInt(0)) verifiedByDay.set(isoDay(row.date), (verifiedByDay.get(isoDay(row.date)) ?? BigInt(0)) + row.costMicros);
  const activityRows = vendorRows.filter((row) => row.requests > 0 || row.inputTokens > BigInt(0) || row.outputTokens > BigInt(0));
  const days = new Set([...activityRows.map((row) => isoDay(row.date)), ...gatewayRows.map((row) => isoDay(row.date)), ...verifiedByDay.keys()]);
  type MutableRow = { key: string; label: string; developerId: string | null; externalApiKeyId: string | null; requests: number; tokens: bigint; allocatedVerifiedMicros: bigint; pendingEstimatedMicros: bigint; estimatedMicros: bigint };
  const output = new Map<string, MutableRow>();
  const add = (key: string, label: string, values: Partial<MutableRow>) => {
    const row = output.get(key) ?? { key, label, developerId: values.developerId ?? null, externalApiKeyId: values.externalApiKeyId ?? null, requests: 0, tokens: BigInt(0), allocatedVerifiedMicros: BigInt(0), pendingEstimatedMicros: BigInt(0), estimatedMicros: BigInt(0) };
    row.requests += values.requests ?? 0;
    row.tokens += values.tokens ?? BigInt(0);
    row.allocatedVerifiedMicros += values.allocatedVerifiedMicros ?? BigInt(0);
    row.pendingEstimatedMicros += values.pendingEstimatedMicros ?? BigInt(0);
    row.estimatedMicros += values.estimatedMicros ?? BigInt(0);
    output.set(key, row);
  };
  const group = (row: typeof activityRows[number], source: "vendor" | "gateway") => {
    const metadata = (row.metadata ?? {}) as Record<string, unknown>;
    const apiKeyId = typeof metadata.apiKeyId === "string" ? metadata.apiKeyId : null;
    const apiKey = apiKeyId ? keyByExternal.get(apiKeyId) : null;
    const developerId = source === "gateway" ? row.developerId : apiKey?.developerId ?? row.developerId;
    const developer = developerId ? developerById.get(developerId) : null;
    if (groupBy === "developer") return { key: developerId ?? "unassigned", label: developer?.name ?? developer?.email ?? "Unassigned", developerId, apiKeyId };
    if (groupBy === "api_key") return { key: source === "gateway" ? "gateway" : apiKeyId ?? "unassigned", label: source === "gateway" ? "Junction gateway" : apiKey?.name ?? apiKeyId ?? "Unassigned", developerId, apiKeyId };
    if (groupBy === "project") {
      const project = (metadata.projectId ?? metadata.workspaceId ?? apiKey?.projectId ?? apiKey?.workspaceId) as string | null | undefined;
      return { key: project ?? "unassigned", label: project ?? "Unassigned", developerId, apiKeyId };
    }
    return { key: row.model || "unknown", label: row.model || "Unknown model", developerId, apiKeyId };
  };
  for (const date of days) {
    const vendor = activityRows.filter((row) => isoDay(row.date) === date).map((row) => ({ row, cost: microsForRow(row) }));
    const gateway = gatewayRows.filter((row) => isoDay(row.date) === date).map((row) => ({ row, cost: microsForRow(row) }));
    const vendorTotal = vendor.reduce((sum, item) => sum + item.cost, BigInt(0));
    const gatewayTotal = gateway.reduce((sum, item) => sum + item.cost, BigInt(0));
    const residual = vendorTotal > gatewayTotal ? vendorTotal - gatewayTotal : BigInt(0);
    const weights: Array<{ key: string; label: string; developerId: string | null; apiKeyId: string | null; weight: bigint; requests: number; tokens: bigint; pending: bigint }> = [];
    for (const item of vendor) {
      const info = group(item.row, "vendor");
      const weight = vendorTotal > BigInt(0) ? item.cost * residual / vendorTotal : BigInt(0);
      const tokens = vendorTotal > BigInt(0)
        ? (item.row.inputTokens + item.row.outputTokens) * residual / vendorTotal
        : BigInt(0);
      weights.push({ ...info, weight, requests: vendorTotal > BigInt(0) ? Math.round(item.row.requests * Number(residual) / Number(vendorTotal)) : 0, tokens, pending: BigInt(0) });
    }
    for (const item of gateway) {
      const info = group(item.row, "gateway");
      const pending = !pool.connection.lastCostSyncedAt || item.row.observedAt > pool.connection.lastCostSyncedAt ? item.cost : BigInt(0);
      weights.push({ ...info, weight: item.cost, requests: item.row.requests, tokens: item.row.inputTokens + item.row.outputTokens, pending });
    }
    const totalWeight = weights.reduce((sum, item) => sum + item.weight, BigInt(0));
    const verified = verifiedByDay.get(date) ?? BigInt(0);
    let allocated = BigInt(0);
    weights.forEach((item, index) => {
      const share = totalWeight > BigInt(0)
        ? (index === weights.length - 1 ? verified - allocated : verified * item.weight / totalWeight)
        : BigInt(0);
      allocated += share;
      add(item.key, item.label, { developerId: item.developerId, externalApiKeyId: item.apiKeyId, requests: item.requests, tokens: item.tokens, allocatedVerifiedMicros: share, pendingEstimatedMicros: item.pending, estimatedMicros: item.weight });
    });
    if (verified > BigInt(0) && totalWeight === BigInt(0)) add("unassigned", "Unassigned", { allocatedVerifiedMicros: verified });
  }
  return {
    poolId,
    groupBy,
    verifiedAvailable,
    keys: keys.map((key) => ({ ...key })),
    developers,
    rows: Array.from(output.values()).map((row) => ({ ...row, tokens: row.tokens.toString(), allocatedVerifiedMicros: row.allocatedVerifiedMicros.toString(), pendingEstimatedMicros: row.pendingEstimatedMicros.toString(), estimatedMicros: row.estimatedMicros.toString() })).sort((a, b) => BigInt(b.allocatedVerifiedMicros) > BigInt(a.allocatedVerifiedMicros) ? 1 : -1),
  };
}
