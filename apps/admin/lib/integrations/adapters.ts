import { createHash } from "crypto";
import { fetchJson, fetchNdjson } from "@/lib/integrations/http";
import type { AdapterContext, ProviderAdapter, ProviderMember, ProviderSeat, ProviderSyncData, ProviderUsage } from "@/lib/integrations/types";

type Row = Record<string, any>;

function day(value: unknown, fallback = new Date()) {
  const date = value instanceof Date ? value : new Date(typeof value === "number" || typeof value === "string" ? value : fallback);
  if (Number.isNaN(date.getTime())) return new Date(Date.UTC(fallback.getUTCFullYear(), fallback.getUTCMonth(), fallback.getUTCDate()));
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function int(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
}

function bigint(value: unknown): bigint {
  return BigInt(int(value));
}

function microsFromUsd(value: unknown): bigint {
  const amount = Number(value ?? 0);
  return BigInt(Number.isFinite(amount) ? Math.max(0, Math.round(amount * 1_000_000)) : 0);
}

function stableKey(prefix: string, row: Row, index: number) {
  const digest = createHash("sha256").update(JSON.stringify(row)).digest("hex").slice(0, 24);
  return `${prefix}:${index}:${digest}`;
}

function range(context: AdapterContext, maxDays = 90) {
  const end = context.now;
  const days = context.initialSync ? maxDays : 3;
  return { start: new Date(end.getTime() - days * 86400_000), end };
}

function basic(key: string) {
  return `Basic ${Buffer.from(`${key}:`).toString("base64")}`;
}

const cursor: ProviderAdapter = {
  provider: "cursor",
  products: ["teams"],
  async validate(context) {
    const data = await fetchJson<Row>("https://api.cursor.com/teams/members", { headers: { Authorization: basic(context.credential) } });
    return { externalOrgId: String(data.teamId ?? context.config.teamId ?? "cursor-team"), permissions: ["members:read", "usage:read", "spend:read"] };
  },
  async sync(context) {
    const headers = { Authorization: basic(context.credential), "content-type": "application/json" };
    const memberResponse = await fetchJson<Row>("https://api.cursor.com/teams/members", { headers });
    const members: ProviderMember[] = (memberResponse.teamMembers ?? []).map((member: Row) => ({
      externalUserId: String(member.id ?? member.email).toLowerCase(), email: member.email?.toLowerCase(), name: member.name, role: member.role, metadata: member,
    }));
    const dates = range(context, 90);
    const dailyResponse = await fetchJson<Row>("https://api.cursor.com/teams/daily-usage-data", {
      method: "POST", headers, body: JSON.stringify({ startDate: dates.start.getTime(), endDate: dates.end.getTime() }),
    });
    const usage: ProviderUsage[] = (dailyResponse.data ?? []).map((row: Row, index: number) => ({
      externalKey: stableKey("cursor-daily", row, index), externalUserId: String(row.userId ?? row.email ?? "").toLowerCase() || null,
      email: row.email?.toLowerCase(), date: day(row.date), provider: "cursor", product: "teams", toolName: "cursor", model: row.mostUsedModel ?? "",
      requests: int(row.composerRequests) + int(row.chatRequests) + int(row.agentRequests),
      suggestedLines: bigint(row.totalLinesAdded), acceptedLines: bigint(row.acceptedLinesAdded),
      addedLines: bigint(row.totalLinesAdded), deletedLines: bigint(row.totalLinesDeleted),
      metadata: { active: Boolean(row.isActive), tabsShown: int(row.totalTabsShown), tabsAccepted: int(row.totalTabsAccepted), clientVersion: row.clientVersion ?? null },
    }));
    let page = 1;
    do {
      const spend = await fetchJson<Row>("https://api.cursor.com/teams/spend", { method: "POST", headers, body: JSON.stringify({ page, pageSize: 100 }) });
      for (const [index, row] of (spend.teamMemberSpend ?? []).entries()) usage.push({
        externalKey: stableKey(`cursor-spend:${spend.subscriptionCycleStart}`, row, index), externalUserId: String(row.userId ?? row.email).toLowerCase(),
        email: row.email?.toLowerCase(), date: day(spend.subscriptionCycleStart), provider: "cursor", product: "teams", toolName: "cursor",
        costMicros: BigInt(int(row.spendCents)) * BigInt(10_000), metadata: { currentSubscriptionCycle: true, fastPremiumRequests: int(row.fastPremiumRequests) },
      });
      if (page >= int(spend.totalPages) || page >= 50) break;
      page += 1;
    } while (true);
    const seats: ProviderSeat[] = members.map((member) => ({ externalUserId: member.externalUserId, product: "cursor", plan: "teams", status: "active" }));
    return { externalOrgId: String(memberResponse.teamId ?? context.config.teamId ?? "cursor-team"), permissions: ["members:read", "usage:read", "spend:read"], members, seats, usage };
  },
};

function githubHeaders(token: string) {
  return { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2026-03-10" };
}

const github: ProviderAdapter = {
  provider: "github",
  products: ["copilot"],
  async validate(context) {
    const org = String(context.config.org ?? "");
    if (!org) throw new Error("GitHub organization is required");
    await fetchJson(`https://api.github.com/orgs/${encodeURIComponent(org)}/copilot/billing`, { headers: githubHeaders(context.credential) });
    return { externalOrgId: org, permissions: ["copilot_seats:read", "copilot_metrics:read"] };
  },
  async sync(context) {
    const org = String(context.config.org ?? "");
    if (!org) throw new Error("GitHub organization is required");
    const headers = githubHeaders(context.credential);
    const members: ProviderMember[] = [];
    const seats: ProviderSeat[] = [];
    for (let pageNumber = 1; pageNumber <= 50; pageNumber += 1) {
      const response = await fetchJson<Row>(`https://api.github.com/orgs/${encodeURIComponent(org)}/copilot/billing/seats?per_page=100&page=${pageNumber}`, { headers });
      const rows: Row[] = response.seats ?? [];
      for (const row of rows) {
        const login = String(row.assignee?.login ?? row.assignee?.id ?? "");
        if (!login) continue;
        members.push({ externalUserId: login.toLowerCase(), name: login, metadata: { githubId: row.assignee?.id } });
        seats.push({ externalUserId: login.toLowerCase(), product: "copilot", plan: row.plan_type, status: row.pending_cancellation_date ? "pending_cancellation" : "active", assignedAt: row.created_at ? new Date(row.created_at) : null, lastActivityAt: row.last_activity_at ? new Date(row.last_activity_at) : null, metadata: { editor: row.last_activity_editor ?? null } });
      }
      if (rows.length < 100) break;
    }
    const usage: ProviderUsage[] = [];
    const dates = range(context, context.initialSync ? 28 : 3);
    for (let cursorDate = dates.start; cursorDate < dates.end; cursorDate = new Date(cursorDate.getTime() + 86400_000)) {
      const reportDay = cursorDate.toISOString().slice(0, 10);
      try {
        const links = await fetchJson<Row>(`https://api.github.com/orgs/${encodeURIComponent(org)}/copilot/metrics/reports/users-1-day?day=${reportDay}`, { headers });
        for (const link of links.download_links ?? []) {
          const rows = await fetchNdjson(String(link));
          rows.forEach((row, index) => usage.push({
            externalKey: stableKey(`github-copilot:${reportDay}`, row, index), externalUserId: String(row.user_login ?? row.user_id ?? "").toLowerCase() || null,
            date: day(reportDay), provider: "github", product: "copilot", toolName: "github-copilot", model: String(row.model ?? ""),
            requests: int(row.requests ?? row.total_engaged_users), suggestedLines: bigint(row.code_generation_activity_count ?? row.lines_suggested),
            acceptedLines: bigint(row.code_acceptance_activity_count ?? row.lines_accepted), metadata: row,
          }));
        }
      } catch (error) {
        if (!String(error).includes("404")) throw error;
      }
    }
    return { externalOrgId: org, permissions: ["copilot_seats:read", "copilot_metrics:read"], members, seats, usage };
  },
};

function bearerHeaders(token: string) {
  return { Authorization: `Bearer ${token}`, "content-type": "application/json" };
}

const openai: ProviderAdapter = {
  provider: "openai",
  products: ["api_platform"],
  async validate(context) {
    await fetchJson("https://api.openai.com/v1/organization/users?limit=1", { headers: bearerHeaders(context.credential) });
    return { permissions: ["organization_users:read", "organization_usage:read", "organization_costs:read"] };
  },
  async sync(context) {
    const headers = bearerHeaders(context.credential);
    const members: ProviderMember[] = [];
    let after = "";
    for (let pageNumber = 0; pageNumber < 50; pageNumber += 1) {
      const response = await fetchJson<Row>(`https://api.openai.com/v1/organization/users?limit=100${after ? `&after=${encodeURIComponent(after)}` : ""}`, { headers });
      for (const row of response.data ?? []) members.push({ externalUserId: String(row.id), email: row.email?.toLowerCase(), name: row.name, role: row.role, metadata: row });
      if (!response.has_more || !response.last_id) break;
      after = String(response.last_id);
    }
    const dates = range(context, 90);
    const usageResponse = await fetchJson<Row>(`https://api.openai.com/v1/organization/usage/completions?start_time=${Math.floor(dates.start.getTime() / 1000)}&end_time=${Math.floor(dates.end.getTime() / 1000)}&bucket_width=1d&group_by=user_id&group_by=model&limit=100`, { headers });
    const usage: ProviderUsage[] = [];
    for (const bucket of usageResponse.data ?? []) for (const [index, row] of (bucket.results ?? []).entries()) usage.push({
      externalKey: stableKey(`openai-usage:${bucket.start_time}`, row, index), externalUserId: row.user_id ?? null, date: day(Number(bucket.start_time) * 1000),
      provider: "openai", product: "api_platform", toolName: "openai-api", model: row.model ?? "", requests: int(row.num_model_requests),
      inputTokens: bigint(row.input_tokens), outputTokens: bigint(row.output_tokens), cacheReadTokens: bigint(row.input_cached_tokens), metadata: { projectId: row.project_id ?? null, apiKeyId: row.api_key_id ?? null },
    });
    const costResponse = await fetchJson<Row>(`https://api.openai.com/v1/organization/costs?start_time=${Math.floor(dates.start.getTime() / 1000)}&end_time=${Math.floor(dates.end.getTime() / 1000)}&bucket_width=1d&limit=180`, { headers });
    for (const bucket of costResponse.data ?? []) for (const [index, row] of (bucket.results ?? []).entries()) usage.push({
      externalKey: stableKey(`openai-cost:${bucket.start_time}`, row, index), date: day(Number(bucket.start_time) * 1000), provider: "openai", product: "api_platform", toolName: "openai-api",
      costMicros: microsFromUsd(row.amount?.value ?? row.amount), metadata: { currency: row.amount?.currency ?? "usd", projectId: row.project_id ?? null, lineItem: row.line_item ?? null },
    });
    return { permissions: ["organization_users:read", "organization_usage:read", "organization_costs:read"], members, seats: [], usage };
  },
};

function anthropicHeaders(key: string) {
  return { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" };
}

const anthropic: ProviderAdapter = {
  provider: "anthropic",
  products: ["api_platform", "enterprise"],
  async validate(context) {
    const product = String(context.config.product ?? "api_platform");
    const path = product === "enterprise" ? "/v1/organizations/usage_report/claude_code" : "/v1/organizations/usage_report/messages";
    const now = context.now.toISOString();
    const start = new Date(context.now.getTime() - 86400_000).toISOString();
    await fetchJson(`https://api.anthropic.com${path}?starting_at=${encodeURIComponent(start)}&ending_at=${encodeURIComponent(now)}&bucket_width=1d`, { headers: anthropicHeaders(context.credential) });
    return { permissions: [product === "enterprise" ? "claude_analytics:read" : "organization_usage:read", "organization_costs:read"] };
  },
  async sync(context) {
    const product = String(context.config.product ?? "api_platform");
    const dates = range(context, 90);
    const path = product === "enterprise" ? "/v1/organizations/usage_report/claude_code" : "/v1/organizations/usage_report/messages";
    const headers = anthropicHeaders(context.credential);
    const usage: ProviderUsage[] = [];
    const query = `starting_at=${encodeURIComponent(dates.start.toISOString())}&ending_at=${encodeURIComponent(dates.end.toISOString())}&bucket_width=1d`;
    const response = await fetchJson<Row>(`https://api.anthropic.com${path}?${query}`, { headers });
    for (const bucket of response.data ?? []) for (const [index, row] of (bucket.results ?? []).entries()) usage.push({
      externalKey: stableKey(`anthropic-usage:${bucket.starting_at}`, row, index), externalUserId: row.user_id ?? row.account_id ?? null, email: row.email?.toLowerCase(),
      date: day(bucket.starting_at), provider: "anthropic", product, toolName: product === "enterprise" ? "claude-code" : "anthropic-api", model: row.model ?? "",
      requests: int(row.request_count), sessions: int(row.session_count), inputTokens: bigint(row.uncached_input_tokens ?? row.input_tokens),
      outputTokens: bigint(row.output_tokens), cacheReadTokens: bigint(row.cache_read_input_tokens), activeSeconds: bigint(row.active_time_seconds),
      addedLines: bigint(row.lines_of_code_added), deletedLines: bigint(row.lines_of_code_removed), commits: int(row.commit_count), pullRequests: int(row.pull_request_count), metadata: row,
    });
    try {
      const costs = await fetchJson<Row>(`https://api.anthropic.com/v1/organizations/cost_report?${query}`, { headers });
      for (const bucket of costs.data ?? []) for (const [index, row] of (bucket.results ?? []).entries()) usage.push({
        externalKey: stableKey(`anthropic-cost:${bucket.starting_at}`, row, index), date: day(bucket.starting_at), provider: "anthropic", product, toolName: product === "enterprise" ? "claude-code" : "anthropic-api",
        costMicros: BigInt(Math.max(0, Math.round(Number(row.amount ?? 0) * 10_000))), metadata: { currency: row.currency ?? "USD", costType: row.cost_type ?? null, model: row.model ?? null },
      });
    } catch (error) {
      if (!String(error).includes("403") && !String(error).includes("404")) throw error;
    }
    const members: ProviderMember[] = [];
    for (const row of usage) if (row.externalUserId) members.push({ externalUserId: row.externalUserId, email: row.email, metadata: { inferredFromUsage: true } });
    return { permissions: [product === "enterprise" ? "claude_analytics:read" : "organization_usage:read", "organization_costs:read"], members, seats: [], usage };
  },
};

const adapters = [cursor, github, openai, anthropic];

export function getAdapter(provider: string, product: string) {
  const adapter = adapters.find((candidate) => candidate.provider === provider && candidate.products.includes(product));
  if (!adapter) throw new Error(`unsupported provider product: ${provider}/${product}`);
  return adapter;
}

export function supportedIntegrations() {
  return adapters.flatMap((adapter) => adapter.products.map((product) => ({ provider: adapter.provider, product })));
}
