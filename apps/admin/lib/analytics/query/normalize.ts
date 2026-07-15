import {
  type NormalizedUsageQueryV1,
  type UsageDimension,
  type UsageMeasure,
  usageQueryV1Schema,
} from "./contracts";

const DAY_MS = 86_400_000;

function isoDay(date: Date) {
  return date.toISOString().slice(0, 10);
}

function parseDay(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || isoDay(date) !== value) {
    throw new Error(`Invalid UTC date: ${value}`);
  }
  return date;
}

function uniqueSorted<T extends string>(values: readonly T[] | undefined): T[] | undefined {
  if (!values?.length) return undefined;
  return Array.from(new Set(values)).sort() as T[];
}

export function normalizeUsageQuery(input: unknown, now = new Date()): NormalizedUsageQueryV1 {
  const parsed = usageQueryV1Schema.parse(input);
  let from: Date;
  let to: Date;

  if ("preset" in parsed.window) {
    to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    from = new Date(to.getTime() - (parsed.window.preset - 1) * DAY_MS);
  } else {
    from = parseDay(parsed.window.from);
    to = parseDay(parsed.window.to);
  }

  const inclusiveDays = Math.floor((to.getTime() - from.getTime()) / DAY_MS) + 1;
  if (inclusiveDays < 1) throw new Error("Query window must end on or after it starts");
  if (inclusiveDays > 366) throw new Error("Query window cannot exceed 366 days");

  const measures = (uniqueSorted(parsed.measures) ?? []) as UsageMeasure[];
  const dimensions = (uniqueSorted(parsed.dimensions) ?? []) as UsageDimension[];
  const availableFields = new Set<string>([...measures, ...dimensions]);
  for (const ordering of parsed.orderBy) {
    if (!availableFields.has(ordering.field)) {
      throw new Error(`orderBy field must be selected: ${ordering.field}`);
    }
  }

  return {
    schemaVersion: "1",
    window: { from: isoDay(from), to: isoDay(to), grain: "day" },
    timezone: "UTC",
    measures,
    dimensions,
    filters: {
      developerIds: uniqueSorted(parsed.filters.developerIds),
      repositoryIds: uniqueSorted(parsed.filters.repositoryIds),
      toolNames: uniqueSorted(parsed.filters.toolNames),
      providers: uniqueSorted(parsed.filters.providers),
      products: uniqueSorted(parsed.filters.products),
      models: uniqueSorted(parsed.filters.models),
      sources: uniqueSorted(parsed.filters.sources),
      metricKinds: uniqueSorted(parsed.filters.metricKinds),
      costKinds: uniqueSorted(parsed.filters.costKinds),
    },
    orderBy: parsed.orderBy,
    limit: parsed.limit,
  };
}

export function stableQueryJson(query: NormalizedUsageQueryV1) {
  return JSON.stringify(query);
}
