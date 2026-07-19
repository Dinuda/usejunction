import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";
import { getAdapter } from "../lib/integrations/adapters";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

test("OpenAI sync paginates projects, keys, usage, and authoritative costs", async () => {
  const calls: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    if (url.includes("/organization/users")) return json({ data: [{ id: "user-1", email: "dev@example.com", name: "Dev" }], has_more: false });
    if (url.includes("/organization/projects?") && !url.includes("after=")) return json({ data: [{ id: "project-1", name: "Production" }], has_more: true, last_id: "project-1" });
    if (url.includes("/organization/projects?") && url.includes("after=")) return json({ data: [], has_more: false });
    if (url.includes("/projects/project-1/api_keys")) return json({ data: [{
      id: "key-1",
      name: "Backend",
      redacted_value: "sk-…1234",
      owner: { type: "user", user: { id: "user-1", email: "dev@example.com" } },
    }], has_more: false });
    if (url.includes("/organization/usage/completions") && !url.includes("page=")) return json({
      data: [{ start_time: 1_784_409_600, results: [{ api_key_id: "key-1", project_id: "project-1", user_id: "user-1", model: "gpt-5", num_model_requests: 2, input_tokens: 100, output_tokens: 50 }] }],
      has_more: true,
      next_page: "usage-2",
    });
    if (url.includes("/organization/usage/completions") && url.includes("page=usage-2")) return json({ data: [], has_more: false });
    if (url.includes("/organization/costs")) return json({
      data: [{ start_time: 1_784_409_600, results: [{ project_id: "project-1", line_item: "Responses API", amount: { value: 1.25, currency: "usd" } }] }],
      has_more: false,
    });
    throw new Error(`Unexpected URL: ${url}`);
  }));

  const result = await getAdapter("openai", "api_platform").sync({
    credential: "secret",
    config: {},
    initialSync: false,
    now: new Date("2026-07-19T00:00:00.000Z"),
  });

  assert.equal(result.apiKeys?.length, 1);
  assert.equal(result.apiKeys?.[0]?.externalKeyId, "key-1");
  assert.equal(result.apiKeys?.[0]?.ownerEmail, "dev@example.com");
  assert.equal(result.apiKeys?.[0]?.redactedHint, "sk-…1234");
  assert.equal(result.usage.find((row) => row.externalApiKeyId === "key-1")?.inputTokens, BigInt(100));
  assert.equal(result.usage.find((row) => row.costMicros)?.costMicros, BigInt(1_250_000));
  assert.equal(result.costSyncSucceeded, true);
  assert.equal(calls.filter((url) => url.includes("/organization/usage/completions")).length, 2);
  assert.equal(calls.filter((url) => url.includes("/organization/projects?")).length, 2);
});

test("OpenAI usage sync remains available when the admin key cannot read costs", async () => {
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("/organization/users")) return json({ data: [], has_more: false });
    if (url.includes("/organization/projects")) return json({ data: [], has_more: false });
    if (url.includes("/organization/usage/completions")) return json({ data: [], has_more: false });
    if (url.includes("/organization/costs")) return json({ error: "forbidden" }, 403);
    throw new Error(`Unexpected URL: ${url}`);
  }));

  const result = await getAdapter("openai", "api_platform").sync({
    credential: "secret", config: {}, initialSync: false, now: new Date("2026-07-19T00:00:00.000Z"),
  });
  assert.equal(result.costSyncSucceeded, false);
  assert.equal(result.costDataThrough, null);
  assert.equal(result.permissions?.includes("organization_costs:read"), false);
});

test("Anthropic initial sync chunks ninety days into reports of at most 31 days", async () => {
  const calls: string[] = [];
  let costResponses = 0;
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    if (url.includes("/organizations/users")) return json({ data: [], has_more: false });
    if (url.includes("/organizations/api_keys")) return json({ data: [], has_more: false });
    if (url.includes("/usage_report/messages")) return json({ data: [], has_more: false });
    if (url.includes("/cost_report")) {
      costResponses += 1;
      return json({
        data: costResponses === 1 ? [{ starting_at: "2026-05-01T00:00:00.000Z", results: [{ amount: "123.45", currency: "USD", workspace_id: "workspace-1", description: "Claude usage" }] }] : [],
        has_more: false,
      });
    }
    throw new Error(`Unexpected URL: ${url}`);
  }));

  const result = await getAdapter("anthropic", "api_platform").sync({
    credential: "secret",
    config: { product: "api_platform" },
    initialSync: true,
    now: new Date("2026-07-19T00:00:00.000Z"),
  });

  const usageCalls = calls.filter((url) => url.includes("/usage_report/messages"));
  const costCalls = calls.filter((url) => url.includes("/cost_report"));
  assert.equal(usageCalls.length, 3);
  assert.equal(costCalls.length, 3);
  for (const url of usageCalls) {
    const query = new URL(url).searchParams;
    const start = new Date(query.get("starting_at")!);
    const end = new Date(query.get("ending_at")!);
    assert.ok((end.getTime() - start.getTime()) / 86_400_000 <= 31);
  }
  assert.equal(result.costSyncSucceeded, true);
  assert.equal(result.costDataThrough?.toISOString(), "2026-07-19T00:00:00.000Z");
  assert.equal(result.usage.find((row) => row.costMicros)?.costMicros, BigInt(1_234_500));
});
