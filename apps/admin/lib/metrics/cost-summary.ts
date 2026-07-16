export type CostSummaryRow = {
  costMicros: number | string | bigint;
  costKind?: string | null;
};

export type CanonicalCostSummary = {
  verifiedUsageCost: number;
  estimatedApiCost: number;
  actualSpendCost: number;
  totalUsageCost: number;
};

function microsToDollars(value: number | string | bigint) {
  return Number(value) / 1_000_000;
}

/** Aggregate already-canonical cost rows without applying source precedence twice. */
export function summarizeCanonicalCosts(rows: CostSummaryRow[]): CanonicalCostSummary {
  const summary: CanonicalCostSummary = {
    verifiedUsageCost: 0,
    estimatedApiCost: 0,
    actualSpendCost: 0,
    totalUsageCost: 0,
  };

  for (const row of rows) {
    const dollars = microsToDollars(row.costMicros);
    if (!Number.isFinite(dollars) || dollars <= 0) continue;

    if (row.costKind === "verified_usage") summary.verifiedUsageCost += dollars;
    else if (row.costKind === "estimated_api") summary.estimatedApiCost += dollars;
    else if (row.costKind === "actual_spend") summary.actualSpendCost += dollars;
  }

  summary.totalUsageCost =
    summary.verifiedUsageCost + summary.estimatedApiCost + summary.actualSpendCost;
  return summary;
}
