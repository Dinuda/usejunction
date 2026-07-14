import { prisma } from "@usejunction/db";
import type {
  BillingUsageFact,
  MetricRow,
  UsageDimension,
  UsageMetricQuery,
  UsageMetricsStore,
} from "@/lib/analytics/contracts/usage-metrics";
import type { MetricWindow } from "@/lib/analytics/contracts/time-window";
import { UTC_TIMEZONE } from "@/lib/analytics/contracts/time-window";
import { fetchUsageRows, selectUsageRows } from "@/lib/metrics/model-usage";
import { isProductivityMetric } from "@/lib/metrics/source-priority";

function isoDay(date: Date) {
  return date.toISOString().slice(0, 10);
}

function dimensionKey(dimensions: UsageDimension[], values: Record<string, string>) {
  return dimensions.map((dimension) => `${dimension}=${values[dimension] ?? ""}`).join("|");
}

function rowMetricKind(row: { metricKind?: string | null; metadata: unknown; source: string }) {
  if (row.metricKind) return row.metricKind;
  if (row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)) {
    const value = (row.metadata as Record<string, unknown>).metricKind;
    if (typeof value === "string") return value;
  }
  return "usage";
}

export class PrismaUsageMetricsStore implements UsageMetricsStore {
  async query(request: UsageMetricQuery): Promise<MetricRow[]> {
    if (request.window.timezone !== UTC_TIMEZONE) {
      throw new Error(`PrismaUsageMetricsStore v1 supports UTC only, got ${request.window.timezone}`);
    }

    const developerId =
      request.developerIds?.length === 1 ? request.developerIds[0] : undefined;

    const rows = await fetchUsageRows({
      orgId: request.orgId,
      developerId,
      from: request.window.from,
      to: request.window.to,
    });

    let filtered = rows;
    if (request.developerIds && request.developerIds.length > 1) {
      const allowed = new Set(request.developerIds);
      filtered = filtered.filter((row) => row.developerId && allowed.has(row.developerId));
    }
    if (request.toolNames?.length) {
      const allowed = new Set(request.toolNames.map((name) => name.toLowerCase()));
      filtered = filtered.filter((row) => allowed.has((row.toolName || "").toLowerCase()));
    }

    const selected = selectUsageRows(filtered);
    const dimensions = request.dimensions?.length ? request.dimensions : (["time"] as UsageDimension[]);
    const measures = new Set(request.measures);
    const map = new Map<string, MetricRow>();

    for (const row of selected) {
      const productivity =
        rowMetricKind(row) === "productivity" || isProductivityMetric(rowMetricKind(row), row.source);
      if (productivity) continue;

      const values: Record<string, string> = {
        time: isoDay(row.date),
        developer: row.developerId ?? "",
        tool: row.toolName || "unknown",
        provider: row.provider || "",
        model: row.model || "",
      };
      const key = dimensionKey(dimensions, values);
      const entry = map.get(key) ?? {
        dimensions: Object.fromEntries(dimensions.map((dimension) => [dimension, values[dimension] ?? ""])) as MetricRow["dimensions"],
        measures: {},
      };

      if (row.selectedActivity) {
        if (measures.has("requests")) entry.measures.requests = (entry.measures.requests ?? 0) + row.requests;
        if (measures.has("inputTokens")) {
          entry.measures.inputTokens = (entry.measures.inputTokens ?? 0) + Number(row.inputTokens);
        }
        if (measures.has("outputTokens")) {
          entry.measures.outputTokens = (entry.measures.outputTokens ?? 0) + Number(row.outputTokens);
        }
      }
      if (row.selectedCost && measures.has("cost")) {
        entry.measures.cost = (entry.measures.cost ?? 0) + Number(row.costMicros) / 1_000_000;
      }

      map.set(key, entry);
    }

    return Array.from(map.values());
  }

  // Prefer the latest calendar usage day so callers know whether today has landed.
  async dataThrough(orgId: string): Promise<Date | null> {
    const latest = await prisma.usageDaily.findFirst({
      where: { orgId },
      orderBy: [{ date: "desc" }, { observedAt: "desc" }],
      select: { date: true },
    });
    return latest?.date ?? null;
  }

  async billingFacts(request: {
    orgId: string;
    window: MetricWindow;
    developerId?: string;
  }): Promise<BillingUsageFact[]> {
    if (request.window.timezone !== UTC_TIMEZONE) {
      throw new Error(`PrismaUsageMetricsStore v1 supports UTC only, got ${request.window.timezone}`);
    }
    const { usageDayFilter } = await import("@/lib/metrics/date-range");
    const rows = await prisma.usageDaily.findMany({
      where: {
        orgId: request.orgId,
        ...(request.developerId ? { developerId: request.developerId } : {}),
        date: usageDayFilter(request.window.from, request.window.to),
      },
      select: {
        date: true,
        developerId: true,
        provider: true,
        product: true,
        toolName: true,
        source: true,
        costMicros: true,
        inputTokens: true,
        outputTokens: true,
        cacheReadTokens: true,
        observedAt: true,
      },
    });
    return rows.map((row) => ({
      date: row.date,
      developerId: row.developerId,
      provider: row.provider,
      product: row.product,
      toolName: row.toolName,
      source: row.source,
      costMicros: row.costMicros,
      inputTokens: row.inputTokens,
      outputTokens: row.outputTokens,
      cacheReadTokens: row.cacheReadTokens,
      observedAt: row.observedAt,
    }));
  }

  async activityRows(request: {
    orgId: string;
    window: MetricWindow;
    developerId?: string;
  }) {
    if (request.window.timezone !== UTC_TIMEZONE) {
      throw new Error(`PrismaUsageMetricsStore v1 supports UTC only, got ${request.window.timezone}`);
    }
    return fetchUsageRows({
      orgId: request.orgId,
      developerId: request.developerId,
      from: request.window.from,
      to: request.window.to,
    });
  }
}

export function createUsageMetricsStore(): UsageMetricsStore {
  return new PrismaUsageMetricsStore();
}
