import { prisma } from "@usejunction/db";
import {
  type AnalyticsQueryRow,
  type AnalyticsScope,
  type NormalizedUsageQueryV1,
  type UsageQueryEnvelopeV1,
} from "./contracts";
import { normalizeUsageQuery } from "./normalize";
import { readDataThrough, runUsageQuerySql } from "./sql";

type LivePayload = {
  generatedAt: string;
  dataThrough: string | null;
  rows: AnalyticsQueryRow[];
};

function envelope(query: NormalizedUsageQueryV1, payload: LivePayload): UsageQueryEnvelopeV1 {
  return {
    schemaVersion: "1",
    kind: "usage-query",
    generatedAt: payload.generatedAt,
    dataThrough: payload.dataThrough,
    timezone: "UTC",
    window: query.window,
    data: { rows: payload.rows },
    meta: { cache: { status: "bypass", expiresAt: null } },
  };
}

/** Always runs live SQL against usage_daily — no query-result cache. */
export async function executeUsageQuery(
  scope: AnalyticsScope,
  input: unknown,
  options: { now?: Date } = {},
): Promise<UsageQueryEnvelopeV1> {
  const now = options.now ?? new Date();
  const query = normalizeUsageQuery(input, now);

  const startedAt = Date.now();
  const [rows, dataThrough] = await Promise.all([
    runUsageQuerySql(prisma, scope, query),
    readDataThrough(prisma, scope),
  ]);
  const payload: LivePayload = {
    generatedAt: now.toISOString(),
    dataThrough: dataThrough?.toISOString() ?? null,
    rows,
  };
  const bytes = Buffer.byteLength(JSON.stringify(payload));
  console.info(JSON.stringify({
    event: "analytics.query",
    orgId: scope.orgId,
    status: "bypass",
    durationMs: Date.now() - startedAt,
    resultRows: rows.length,
    resultBytes: bytes,
  }));
  return envelope(query, payload);
}
