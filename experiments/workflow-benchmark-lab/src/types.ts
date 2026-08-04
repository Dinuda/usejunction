export type Harness = "Claude Code" | "Codex" | "Cursor" | "UseJunction";
export type TaskCategory =
  | "feature"
  | "bug fix"
  | "refactor"
  | "testing/debugging"
  | "docs/configuration"
  | "unknown";

export type Outcome = "passed" | "failed" | "not_measured";
export type Acceptance = "accepted" | "rejected" | "unclear";

export type SessionRecord = {
  id: string;
  harness: Harness;
  model: string | null;
  date: string;
  startedAt: string | null;
  endedAt: string | null;
  durationMs: number | null;
  turns: number;
  iterations: number;
  toolCalls: number;
  failedToolCalls: number;
  recoveredFailures: number;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number | null;
  repository: string;
  taskCategory: TaskCategory;
  testOutcome: Outcome;
  buildOutcome: Outcome;
  acceptance: Acceptance;
  sourceKind: "session";
};

export type UsageRecord = {
  harness: Harness;
  model: string | null;
  date: string;
  requests: number;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number | null;
  sourceKind: "usage_cache";
};

export type SourceFile = {
  harness: Harness;
  kind: "session" | "usage_cache";
  path: string;
};

export type Aggregate = {
  key: string;
  harness: Harness;
  model: string;
  taskCategory: TaskCategory;
  repository: string;
  sessions: number;
  observations: number;
  acceptedSessions: number;
  rejectedSessions: number;
  acceptanceMeasured: number;
  durationMs: number[];
  iterations: number[];
  tokensPerSession: number[];
  costs: number[];
  failureRates: number[];
  recoveryRates: number[];
  testPasses: number;
  testMeasured: number;
  buildPasses: number;
  buildMeasured: number;
  acceptedSessions: number;
  rejectedSessions: number;
  acceptanceMeasured: number;
  tokens: number;
  costUsd: number;
};

export type MetricSummary = {
  p50: number | null;
  p90: number | null;
  mean: number | null;
  low: number | null;
  high: number | null;
  samples: number;
};

export type ReportAggregate = {
  key: string;
  harness: Harness;
  model: string;
  taskCategory: TaskCategory;
  repository: string;
  sessions: number;
  observations: number;
  duration: MetricSummary;
  iterations: MetricSummary;
  tokensPerSession: MetricSummary;
  cost: MetricSummary;
  failureRate: MetricSummary;
  recoveryRate: MetricSummary;
  testPassRate: number | null;
  buildPassRate: number | null;
  acceptanceRate: number | null;
  coverage: number;
  compositeScore: number | null;
  scoreConfidence: { low: number; high: number } | null;
};

export type Verdict = {
  label: "Promising" | "Inconclusive" | "Not useful yet";
  explanation: string;
  eligibleGroups: number;
  comparisonCells: number;
  stableCells: number;
};

export type ReportData = {
  generatedAt: string;
  dateRange: { from: string | null; to: string | null };
  sourceFiles: { harness: Harness; kind: SourceFile["kind"] }[];
  coverage: {
    sessions: number;
    usageRecords: number;
    harnesses: Harness[];
    models: string[];
    taskCategories: TaskCategory[];
    repositories: string[];
    acceptance: { measured: number; accepted: number; rejected: number; unclear: number };
    missing: Record<string, number>;
  };
  verdict: Verdict;
  aggregates: ReportAggregate[];
  trend: { date: string; requests: number; tokens: number; costUsd: number; failureRate: number | null }[];
  methodology: string[];
};
