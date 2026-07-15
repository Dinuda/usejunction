import { Prisma, prisma } from "@usejunction/db";
import type {
  AnalyticsQueryRow,
  AnalyticsScope,
  NormalizedUsageQueryV1,
  UsageDimension,
  UsageMeasure,
} from "./contracts";
import type { MetricWindow } from "@/lib/analytics/contracts/time-window";

type QueryClient = typeof prisma | Prisma.TransactionClient;

const dimensionSql: Record<UsageDimension, Prisma.Sql> = {
  day: Prisma.sql`TO_CHAR(date, 'YYYY-MM-DD')`,
  developer: Prisma.sql`COALESCE(developer_id, '')`,
  repository: Prisma.sql`COALESCE(repository_id, '')`,
  tool: Prisma.sql`COALESCE(tool_name, '')`,
  provider: Prisma.sql`COALESCE(provider, '')`,
  product: Prisma.sql`COALESCE(product, '')`,
  model: Prisma.sql`COALESCE(model, '')`,
  source: Prisma.sql`normalized_source`,
  metricKind: Prisma.sql`effective_metric_kind`,
  costKind: Prisma.sql`effective_cost_kind`,
};

const measureValueSql: Record<UsageMeasure, Prisma.Sql> = {
  requests: Prisma.sql`COALESCE(SUM(CASE WHEN selected_activity THEN requests ELSE 0 END), 0)::bigint`,
  sessions: Prisma.sql`COALESCE(SUM(CASE WHEN selected_activity THEN sessions ELSE 0 END), 0)::bigint`,
  inputTokens: Prisma.sql`COALESCE(SUM(CASE WHEN selected_activity THEN input_tokens ELSE 0 END), 0)::bigint::text`,
  outputTokens: Prisma.sql`COALESCE(SUM(CASE WHEN selected_activity THEN output_tokens ELSE 0 END), 0)::bigint::text`,
  cacheReadTokens: Prisma.sql`COALESCE(SUM(CASE WHEN selected_activity THEN cache_read_tokens ELSE 0 END), 0)::bigint::text`,
  cacheWriteTokens: Prisma.sql`COALESCE(SUM(CASE WHEN selected_activity THEN cache_write_tokens ELSE 0 END), 0)::bigint::text`,
  reasoningTokens: Prisma.sql`COALESCE(SUM(CASE WHEN selected_activity THEN reasoning_tokens ELSE 0 END), 0)::bigint::text`,
  activeSeconds: Prisma.sql`COALESCE(SUM(CASE WHEN selected_activity THEN active_seconds ELSE 0 END), 0)::bigint::text`,
  suggestedLines: Prisma.sql`COALESCE(SUM(CASE WHEN effective_metric_kind = 'productivity' THEN suggested_lines ELSE 0 END), 0)::bigint::text`,
  acceptedLines: Prisma.sql`COALESCE(SUM(CASE WHEN effective_metric_kind = 'productivity' THEN accepted_lines ELSE 0 END), 0)::bigint::text`,
  addedLines: Prisma.sql`COALESCE(SUM(CASE WHEN effective_metric_kind = 'productivity' THEN added_lines ELSE 0 END), 0)::bigint::text`,
  deletedLines: Prisma.sql`COALESCE(SUM(CASE WHEN effective_metric_kind = 'productivity' THEN deleted_lines ELSE 0 END), 0)::bigint::text`,
  commits: Prisma.sql`COALESCE(SUM(CASE WHEN effective_metric_kind = 'productivity' THEN commits ELSE 0 END), 0)::bigint`,
  pullRequests: Prisma.sql`COALESCE(SUM(CASE WHEN effective_metric_kind = 'productivity' THEN pull_requests ELSE 0 END), 0)::bigint`,
  costMicros: Prisma.sql`COALESCE(SUM(CASE WHEN selected_cost THEN cost_micros ELSE 0 END), 0)::bigint::text`,
  activeDevelopers: Prisma.sql`COUNT(DISTINCT developer_id) FILTER (WHERE selected_activity AND requests > 0)::int`,
};

const measureOrderSql: Record<UsageMeasure, Prisma.Sql> = {
  ...measureValueSql,
  inputTokens: Prisma.sql`COALESCE(SUM(CASE WHEN selected_activity THEN input_tokens ELSE 0 END), 0)::bigint`,
  outputTokens: Prisma.sql`COALESCE(SUM(CASE WHEN selected_activity THEN output_tokens ELSE 0 END), 0)::bigint`,
  cacheReadTokens: Prisma.sql`COALESCE(SUM(CASE WHEN selected_activity THEN cache_read_tokens ELSE 0 END), 0)::bigint`,
  cacheWriteTokens: Prisma.sql`COALESCE(SUM(CASE WHEN selected_activity THEN cache_write_tokens ELSE 0 END), 0)::bigint`,
  reasoningTokens: Prisma.sql`COALESCE(SUM(CASE WHEN selected_activity THEN reasoning_tokens ELSE 0 END), 0)::bigint`,
  activeSeconds: Prisma.sql`COALESCE(SUM(CASE WHEN selected_activity THEN active_seconds ELSE 0 END), 0)::bigint`,
  suggestedLines: Prisma.sql`COALESCE(SUM(CASE WHEN effective_metric_kind = 'productivity' THEN suggested_lines ELSE 0 END), 0)::bigint`,
  acceptedLines: Prisma.sql`COALESCE(SUM(CASE WHEN effective_metric_kind = 'productivity' THEN accepted_lines ELSE 0 END), 0)::bigint`,
  addedLines: Prisma.sql`COALESCE(SUM(CASE WHEN effective_metric_kind = 'productivity' THEN added_lines ELSE 0 END), 0)::bigint`,
  deletedLines: Prisma.sql`COALESCE(SUM(CASE WHEN effective_metric_kind = 'productivity' THEN deleted_lines ELSE 0 END), 0)::bigint`,
  costMicros: Prisma.sql`COALESCE(SUM(CASE WHEN selected_cost THEN cost_micros ELSE 0 END), 0)::bigint`,
};

function listFilter(column: Prisma.Sql, values: string[] | undefined) {
  return values?.length ? Prisma.sql`${column} IN (${Prisma.join(values)})` : null;
}

function canonicalUsageCtes(scope: AnalyticsScope, query: NormalizedUsageQueryV1) {
  const baseWhere: Prisma.Sql[] = [
    Prisma.sql`org_id = ${scope.orgId}`,
    Prisma.sql`date >= ${new Date(`${query.window.from}T00:00:00.000Z`)}`,
    Prisma.sql`date <= ${new Date(`${query.window.to}T00:00:00.000Z`)}`,
  ];
  if (scope.developerId) baseWhere.push(Prisma.sql`developer_id = ${scope.developerId}`);

  const filters = query.filters;
  const finalWhere = [
    listFilter(Prisma.sql`developer_id`, filters.developerIds),
    listFilter(Prisma.sql`repository_id`, filters.repositoryIds),
    listFilter(Prisma.sql`tool_name`, filters.toolNames),
    listFilter(Prisma.sql`provider`, filters.providers),
    listFilter(Prisma.sql`product`, filters.products),
    listFilter(Prisma.sql`model`, filters.models),
    listFilter(Prisma.sql`normalized_source`, filters.sources),
    listFilter(Prisma.sql`effective_metric_kind`, filters.metricKinds),
    listFilter(Prisma.sql`effective_cost_kind`, filters.costKinds),
  ].filter((value): value is Prisma.Sql => value != null);

  return Prisma.sql`
    WITH classified AS (
      SELECT usage_daily.*,
        CASE source
          WHEN 'local_scan' THEN 'device_observed'
          WHEN 'cursor_local' THEN 'device_observed'
          WHEN 'cursor_usage_events' THEN 'vendor_verified'
          WHEN 'cursor_plan_percent' THEN 'device_observed'
          ELSE source
        END AS normalized_source,
        CASE
          WHEN source = 'cursor_local' OR metric_kind = 'productivity' THEN 'productivity'
          ELSE COALESCE(NULLIF(metric_kind, ''), metadata->>'metricKind', 'usage')
        END AS effective_metric_kind,
        CASE
          WHEN cost_kind IS NOT NULL THEN cost_kind
          WHEN verified OR source IN ('vendor_verified', 'cursor_usage_events') THEN 'verified_usage'
          WHEN source = 'invoice_imported' THEN 'actual_spend'
          ELSE 'estimated_api'
        END AS effective_cost_kind,
        CASE
          WHEN source IN ('vendor_verified', 'cursor_usage_events') THEN 0
          WHEN source = 'otel_observed' THEN 1
          WHEN source IN ('device_observed', 'local_scan', 'cursor_local', 'cursor_plan_percent') THEN 2
          WHEN source = 'gateway_observed' THEN 3
          WHEN source = 'estimated' THEN 4
          ELSE 99
        END AS activity_priority,
        CASE
          WHEN source IN ('vendor_verified', 'cursor_usage_events', 'invoice_imported') THEN 0
          WHEN source = 'gateway_observed' THEN 1
          WHEN source IN ('estimated', 'device_observed', 'local_scan', 'cursor_local', 'cursor_plan_percent') THEN 2
          WHEN source = 'otel_observed' THEN 3
          ELSE 99
        END AS cost_priority
      FROM usage_daily
      WHERE ${Prisma.join(baseWhere, " AND ")}
    ), ranked AS (
      SELECT classified.*,
        MIN(activity_priority) FILTER (
          WHERE effective_metric_kind <> 'productivity'
            AND (requests > 0 OR sessions > 0 OR input_tokens > 0 OR output_tokens > 0 OR active_seconds > 0)
        ) OVER (
          PARTITION BY date, developer_id, provider, product, tool_name, model
        ) AS best_activity_priority,
        MIN(cost_priority) FILTER (WHERE cost_micros > 0) OVER (
          PARTITION BY date, developer_id, provider, product, tool_name, model
        ) AS best_cost_priority
      FROM classified
    ), canonical AS (
      SELECT ranked.*,
        effective_metric_kind <> 'productivity'
          AND normalized_source <> 'estimated'
          AND activity_priority = best_activity_priority
          AND (requests > 0 OR sessions > 0 OR input_tokens > 0 OR output_tokens > 0 OR active_seconds > 0)
          AS selected_activity,
        cost_micros > 0 AND cost_priority = best_cost_priority AS selected_cost
      FROM ranked
    ), selected AS (
      SELECT * FROM canonical
      WHERE (selected_activity OR selected_cost OR effective_metric_kind = 'productivity')
        ${finalWhere.length ? Prisma.sql`AND ${Prisma.join(finalWhere, " AND ")}` : Prisma.empty}
    )
  `;
}

export async function runUsageQuerySql(
  client: QueryClient,
  scope: AnalyticsScope,
  query: NormalizedUsageQueryV1,
): Promise<AnalyticsQueryRow[]> {
  const dimensionPairs = query.dimensions.map((dimension) =>
    Prisma.sql`${dimension}, ${dimensionSql[dimension]}`,
  );
  const measurePairs = query.measures.map((measure) =>
    Prisma.sql`${measure}, ${measureValueSql[measure]}`,
  );
  const dimensionsJson = dimensionPairs.length
    ? Prisma.sql`jsonb_build_object(${Prisma.join(dimensionPairs)})`
    : Prisma.sql`'{}'::jsonb`;
  const measuresJson = Prisma.sql`jsonb_build_object(${Prisma.join(measurePairs)})`;
  const groupBy = query.dimensions.length
    ? Prisma.sql`GROUP BY ${Prisma.join(query.dimensions.map((dimension) => dimensionSql[dimension]))}`
    : Prisma.empty;

  const explicitOrder = query.orderBy.map((ordering) => {
    const expression = ordering.field in dimensionSql
      ? dimensionSql[ordering.field as UsageDimension]
      : measureOrderSql[ordering.field as UsageMeasure];
    return Prisma.sql`${expression} ${Prisma.raw(ordering.direction.toUpperCase())}`;
  });
  const tieBreakers = query.dimensions.map((dimension) => Prisma.sql`${dimensionSql[dimension]} ASC`);
  const defaultOrder = query.dimensions.length
    ? tieBreakers
    : [Prisma.sql`${measureOrderSql[query.measures[0]]} DESC`];
  const orderBy = [...explicitOrder, ...tieBreakers];

  const statement = Prisma.sql`
    ${canonicalUsageCtes(scope, query)}
    SELECT ${dimensionsJson} AS dimensions, ${measuresJson} AS measures
    FROM selected
    ${groupBy}
    ORDER BY ${Prisma.join(orderBy.length ? orderBy : defaultOrder)}
    LIMIT ${query.limit}
  `;

  const rows = await (client as typeof prisma).$queryRaw<AnalyticsQueryRow[]>(statement);
  return rows.map((row) => ({ dimensions: row.dimensions ?? {}, measures: row.measures ?? {} }));
}

export async function readDataThrough(client: QueryClient, scope: AnalyticsScope) {
  const rows = await (client as typeof prisma).$queryRaw<Array<{ dataThrough: Date | null }>>(Prisma.sql`
    SELECT MAX(date) AS "dataThrough"
    FROM usage_daily
    WHERE org_id = ${scope.orgId}
      ${scope.developerId ? Prisma.sql`AND developer_id = ${scope.developerId}` : Prisma.empty}
  `);
  return rows[0]?.dataThrough ?? null;
}

export type CanonicalBillingFact = {
  date: Date;
  developerId: string | null;
  provider: string;
  product: string;
  toolName: string;
  source: string;
  costMicros: bigint;
  inputTokens: bigint;
  outputTokens: bigint;
  cacheReadTokens: bigint;
  observedAt: Date;
};

export async function readCanonicalBillingFacts(
  client: QueryClient,
  scope: AnalyticsScope,
  window: MetricWindow,
): Promise<CanonicalBillingFact[]> {
  const query: NormalizedUsageQueryV1 = {
    schemaVersion: "1",
    window: {
      from: window.from.toISOString().slice(0, 10),
      to: window.to.toISOString().slice(0, 10),
      grain: "day",
    },
    timezone: "UTC",
    measures: ["inputTokens"],
    dimensions: [],
    filters: {},
    orderBy: [],
    limit: 500,
  };
  return (client as typeof prisma).$queryRaw<CanonicalBillingFact[]>(Prisma.sql`
    ${canonicalUsageCtes(scope, query)}
    SELECT date,
      developer_id AS "developerId",
      provider,
      product,
      tool_name AS "toolName",
      'canonical'::text AS source,
      COALESCE(SUM(CASE WHEN selected_cost THEN cost_micros ELSE 0 END), 0)::bigint AS "costMicros",
      COALESCE(SUM(CASE WHEN selected_activity THEN input_tokens ELSE 0 END), 0)::bigint AS "inputTokens",
      COALESCE(SUM(CASE WHEN selected_activity THEN output_tokens ELSE 0 END), 0)::bigint AS "outputTokens",
      COALESCE(SUM(CASE WHEN selected_activity THEN cache_read_tokens ELSE 0 END), 0)::bigint AS "cacheReadTokens",
      MAX(observed_at) AS "observedAt"
    FROM selected
    GROUP BY date, developer_id, provider, product, tool_name
    ORDER BY date ASC, developer_id ASC NULLS LAST, provider ASC, product ASC, tool_name ASC
  `);
}
