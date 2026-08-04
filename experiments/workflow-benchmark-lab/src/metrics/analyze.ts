import type { Aggregate, ReportAggregate, ReportData, SessionRecord, SourceFile, UsageRecord, Verdict } from "../types.js";

function percentile(values: number[], percentileValue: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * percentileValue;
  const lower = Math.floor(index); const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function mean(values: number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function summary(values: number[]) {
  const p50 = percentile(values, 0.5); const p90 = percentile(values, 0.9);
  if (p50 === null || p90 === null) return { p50: null, p90: null, mean: null, low: null, high: null, samples: 0 };
  const average = mean(values)!;
  const margin = values.length > 1 ? 1.96 * (Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1)) / Math.sqrt(values.length)) : 0;
  return { p50, p90, mean: average, low: Math.max(0, average - margin), high: average + margin, samples: values.length };
}

function key(harness: string, model: string, category: string, repository: string) {
  return `${harness}::${model}::${category}::${repository}`;
}

function createAggregate(harness: SessionRecord["harness"], model: string, taskCategory: SessionRecord["taskCategory"], repository: string): Aggregate {
  return { key: key(harness, model, taskCategory, repository), harness, model, taskCategory, repository, sessions: 0, observations: 0, durationMs: [], iterations: [], tokensPerSession: [], costs: [], failureRates: [], recoveryRates: [], testPasses: 0, testMeasured: 0, acceptedSessions: 0, rejectedSessions: 0, acceptanceMeasured: 0, buildPasses: 0, buildMeasured: 0, tokens: 0, costUsd: 0 };
}

export function aggregateRecords(sessions: SessionRecord[], usage: UsageRecord[]): Aggregate[] {
  const groups = new Map<string, Aggregate>();
  const get = (harness: SessionRecord["harness"], model: string, category: SessionRecord["taskCategory"], repository = "unknown project") => {
    const aggregateKey = key(harness, model, category, repository);
    if (!groups.has(aggregateKey)) groups.set(aggregateKey, createAggregate(harness, model, category, repository));
    return groups.get(aggregateKey)!;
  };
  for (const session of sessions) {
    const group = get(session.harness, session.model ?? "Unknown model", session.taskCategory, session.repository);
    group.sessions += 1; group.observations += 1;
    if (session.durationMs !== null && session.durationMs >= 0) group.durationMs.push(session.durationMs);
    if (session.iterations > 0) group.iterations.push(session.iterations);
    const tokenTotal = (session.inputTokens ?? 0) + (session.outputTokens ?? 0);
    if (session.inputTokens !== null || session.outputTokens !== null) { group.tokensPerSession.push(tokenTotal); group.tokens += tokenTotal; }
    if (session.costUsd !== null) { group.costs.push(session.costUsd); group.costUsd += session.costUsd; }
    if (session.toolCalls > 0) group.failureRates.push(session.failedToolCalls / session.toolCalls);
    if (session.failedToolCalls > 0) group.recoveryRates.push(session.recoveredFailures / session.failedToolCalls);
    if (session.testOutcome !== "not_measured") { group.testMeasured += 1; if (session.testOutcome === "passed") group.testPasses += 1; }
    if (session.buildOutcome !== "not_measured") { group.buildMeasured += 1; if (session.buildOutcome === "passed") group.buildPasses += 1; }
    if (session.acceptance !== "unclear") { group.acceptanceMeasured += 1; if (session.acceptance === "accepted") group.acceptedSessions += 1; if (session.acceptance === "rejected") group.rejectedSessions += 1; }
  }
  for (const record of usage) {
    const group = get(record.harness, record.model ?? "Unknown model", "unknown", "unknown project");
    group.observations += Math.max(1, record.requests);
    const tokens = (record.inputTokens ?? 0) + (record.outputTokens ?? 0);
    if (record.inputTokens !== null || record.outputTokens !== null) group.tokens += tokens;
    if (record.costUsd !== null) group.costUsd += record.costUsd;
  }
  return [...groups.values()].sort((a, b) => b.sessions - a.sessions || a.key.localeCompare(b.key));
}

function normalizeLower(value: number | null, min: number, max: number): number | null {
  if (value === null || max <= min) return null;
  return 1 - Math.min(1, Math.max(0, (value - min) / (max - min)));
}

function normalizeHigher(value: number | null, min: number, max: number): number | null {
  if (value === null || max <= min) return null;
  return Math.min(1, Math.max(0, (value - min) / (max - min)));
}

function reportAggregate(group: Aggregate, all: Aggregate[]): ReportAggregate {
  const duration = summary(group.durationMs); const iterations = summary(group.iterations);
  const tokensPerSession = summary(group.tokensPerSession); const cost = summary(group.costs);
  const failureRate = summary(group.failureRates); const recoveryRate = summary(group.recoveryRates);
  const acceptanceRate = group.acceptanceMeasured ? group.acceptedSessions / group.acceptanceMeasured : null;
  const dimensions = [duration.p50, iterations.p50, tokensPerSession.p50, failureRate.p50, recoveryRate.p50, group.testMeasured ? group.testPasses / group.testMeasured : null, acceptanceRate].filter((value): value is number => value !== null);
  const coverage = dimensions.length / 7;
  const ranges = {
    duration: all.map((item) => summary(item.durationMs).p50).filter((value): value is number => value !== null),
    iterations: all.map((item) => summary(item.iterations).p50).filter((value): value is number => value !== null),
    tokens: all.map((item) => summary(item.tokensPerSession).p50).filter((value): value is number => value !== null),
    failure: all.map((item) => summary(item.failureRates).p50).filter((value): value is number => value !== null),
    recovery: all.map((item) => summary(item.recoveryRates).p50).filter((value): value is number => value !== null),
    test: all.map((item) => item.testMeasured ? item.testPasses / item.testMeasured : null).filter((value): value is number => value !== null),
    acceptance: all.map((item) => item.acceptanceMeasured ? item.acceptedSessions / item.acceptanceMeasured : null).filter((value): value is number => value !== null),
  };
  const range = (values: number[]) => ({ min: Math.min(...values, 0), max: Math.max(...values, 1) });
  const scores = [
    normalizeLower(duration.p50, range(ranges.duration).min, range(ranges.duration).max),
    normalizeLower(iterations.p50, range(ranges.iterations).min, range(ranges.iterations).max),
    normalizeLower(tokensPerSession.p50, range(ranges.tokens).min, range(ranges.tokens).max),
    normalizeLower(failureRate.p50, range(ranges.failure).min, range(ranges.failure).max),
    normalizeHigher(recoveryRate.p50, range(ranges.recovery).min, range(ranges.recovery).max),
    normalizeHigher(group.testMeasured ? group.testPasses / group.testMeasured : null, range(ranges.test).min, range(ranges.test).max),
    normalizeHigher(acceptanceRate, range(ranges.acceptance).min, range(ranges.acceptance).max),
  ].filter((value): value is number => value !== null);
  const eligible = group.sessions >= 5 && coverage >= 0.5 && scores.length >= 3;
  const score = eligible ? (scores.reduce((sum, value) => sum + value, 0) / scores.length) * 100 : null;
  return {
    key: group.key, harness: group.harness, model: group.model, taskCategory: group.taskCategory, repository: group.repository,
    sessions: group.sessions, observations: group.observations, acceptedSessions: group.acceptedSessions, rejectedSessions: group.rejectedSessions, acceptanceMeasured: group.acceptanceMeasured, duration, iterations, tokensPerSession, cost, failureRate, recoveryRate,
    testPassRate: group.testMeasured ? group.testPasses / group.testMeasured : null,
    buildPassRate: group.buildMeasured ? group.buildPasses / group.buildMeasured : null,
    acceptanceRate,
    coverage, compositeScore: score, scoreConfidence: score === null ? null : { low: Math.max(0, score - 8 / Math.sqrt(group.sessions)), high: Math.min(100, score + 8 / Math.sqrt(group.sessions)) },
  };
}

function verdictFor(aggregates: ReportAggregate[]): Verdict {
  const eligible = aggregates.filter((group) => group.sessions >= 5 && group.compositeScore !== null);
  const categories = new Map<string, ReportAggregate[]>();
  for (const group of eligible) (categories.get(group.taskCategory) ?? categories.set(group.taskCategory, []).get(group.taskCategory)!).push(group);
  const comparisonCells = [...categories.values()].filter((groups) => new Set(groups.map((group) => `${group.harness}::${group.model}`)).size >= 2).length;
  let stableCells = 0;
  for (const groups of categories.values()) {
    if (groups.length < 2) continue;
    const ordered = [...groups].sort((a, b) => (b.compositeScore ?? -1) - (a.compositeScore ?? -1));
    const best = ordered[0];
    const meaningful = (best.compositeScore ?? 0) - (ordered[1].compositeScore ?? 0) >= 10;
    if (meaningful) stableCells += 1;
  }
  if (comparisonCells >= 2 && stableCells >= 2) return { label: "Promising", explanation: "Repeated comparisons show measurable, meaningful workflow differences across multiple task categories.", eligibleGroups: eligible.length, comparisonCells, stableCells };
  if (comparisonCells === 0) return { label: "Not useful yet", explanation: "The available local history does not contain enough repeated model × harness comparisons to rank workflows.", eligibleGroups: eligible.length, comparisonCells, stableCells };
  return { label: "Inconclusive", explanation: "Some comparisons are available, but coverage, metric completeness, or score separation is not yet strong enough for a dependable conclusion.", eligibleGroups: eligible.length, comparisonCells, stableCells };
}

export function buildReport(sessions: SessionRecord[], usage: UsageRecord[], sourceFiles: SourceFile[]): ReportData {
  const rawAggregates = aggregateRecords(sessions, usage);
  const aggregates = rawAggregates.map((group) => reportAggregate(group, rawAggregates));
  const allDates = [...sessions.map((item) => item.date), ...usage.map((item) => item.date)].sort();
  const missing: Record<string, number> = { duration: 0, tokens: 0, cost: 0, testOutcome: 0, buildOutcome: 0, acceptance: 0 };
  let acceptanceMeasured = 0; let acceptedSessions = 0; let rejectedSessions = 0;
  for (const session of sessions) {
    if (session.durationMs === null) missing.duration += 1;
    if (session.inputTokens === null && session.outputTokens === null) missing.tokens += 1;
    if (session.costUsd === null) missing.cost += 1;
    if (session.testOutcome === "not_measured") missing.testOutcome += 1;
    if (session.buildOutcome === "not_measured") missing.buildOutcome += 1;
    if (session.acceptance === "unclear") missing.acceptance += 1;
    else { acceptanceMeasured += 1; if (session.acceptance === "accepted") acceptedSessions += 1; if (session.acceptance === "rejected") rejectedSessions += 1; }
  }
  const trendMap = new Map<string, { requests: number; tokens: number; costUsd: number; failures: number; toolCalls: number }>();
  for (const session of sessions) {
    const item = trendMap.get(session.date) ?? { requests: 0, tokens: 0, costUsd: 0, failures: 0, toolCalls: 0 };
    item.requests += 1; item.tokens += (session.inputTokens ?? 0) + (session.outputTokens ?? 0); item.costUsd += session.costUsd ?? 0; item.failures += session.failedToolCalls; item.toolCalls += session.toolCalls; trendMap.set(session.date, item);
  }
  for (const record of usage) {
    const item = trendMap.get(record.date) ?? { requests: 0, tokens: 0, costUsd: 0, failures: 0, toolCalls: 0 };
    item.requests += record.requests; item.tokens += (record.inputTokens ?? 0) + (record.outputTokens ?? 0); item.costUsd += record.costUsd ?? 0; trendMap.set(record.date, item);
  }
  return {
    generatedAt: new Date().toISOString(), dateRange: { from: allDates[0] ?? null, to: allDates.at(-1) ?? null },
    sourceFiles: sourceFiles.map(({ harness, kind }) => ({ harness, kind })),
    coverage: { sessions: sessions.length, usageRecords: usage.length, harnesses: [...new Set([...sessions.map((item) => item.harness), ...usage.map((item) => item.harness)])], models: [...new Set(aggregates.map((item) => item.model))].sort(), taskCategories: [...new Set(sessions.map((item) => item.taskCategory))].sort(), repositories: [...new Set(sessions.map((item) => item.repository))].sort(), acceptance: { measured: acceptanceMeasured, accepted: acceptedSessions, rejected: rejectedSessions, unclear: missing.acceptance }, missing },
    verdict: verdictFor(aggregates), aggregates,
    trend: [...trendMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, item]) => ({ date, requests: item.requests, tokens: item.tokens, costUsd: item.costUsd, failureRate: item.toolCalls ? item.failures / item.toolCalls : null })),
    methodology: ["Sessions are read only from approved Claude, Codex, and Cursor JSONL locations.", "UseJunction aggregate caches are used only for token, request, and cost context.", "Raw prompts, code, file contents, credentials, paths, and transcripts are never written to the report.", "User follow-up messages are classified in memory as accepted, rejected, or unclear using explicit confirmation and correction language; the original text is discarded.", "A group needs at least five sessions, 50% metric coverage, and three measurable dimensions before receiving a composite score.", "Composite scores favor lower duration, iterations, tokens, and failure rates, and higher recovery, explicit test pass, and user-acceptance rates."],
  };
}
