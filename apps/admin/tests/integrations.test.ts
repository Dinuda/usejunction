import assert from "node:assert/strict";
import { test } from "vitest";
import { getAdapter } from "../lib/integrations/adapters";
import { providerFetch } from "../lib/integrations/http";

test("provider HTTP retries a rate limit response", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return calls === 1 ? new Response("limited", { status: 429, headers: { "retry-after": "0" } }) : Response.json({ ok: true });
  };
  try {
    const response = await providerFetch("https://api.cursor.com/test");
    assert.equal(response.status, 200);
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = original;
  }
});

test("Cursor adapter bounds initial daily usage to 90 days and normalizes provenance data", async () => {
  const original = globalThis.fetch;
  let requestedRange = 0;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith("/teams/members")) return Response.json({ teamId: "team_1", teamMembers: [{ id: 7, email: "Alice@Acme.com", name: "Alice", role: "member" }] });
    if (url.endsWith("/teams/daily-usage-data")) {
      const body = JSON.parse(String(init?.body));
      requestedRange = body.endDate - body.startDate;
      return Response.json({ data: [{ userId: 7, email: "Alice@Acme.com", date: Date.UTC(2026, 6, 1), isActive: true, agentRequests: 3, totalLinesAdded: 10, acceptedLinesAdded: 6 }] });
    }
    if (url.endsWith("/teams/spend")) return Response.json({ teamMemberSpend: [{ userId: 7, email: "Alice@Acme.com", spendCents: 250 }], subscriptionCycleStart: Date.UTC(2026, 6, 1), totalPages: 1 });
    throw new Error(`unexpected URL ${url}`);
  };
  try {
    const data = await getAdapter("cursor", "teams").sync({ credential: "key_cursor_admin", config: {}, initialSync: true, now: new Date("2026-07-10T00:00:00Z") });
    assert.ok(requestedRange <= 90 * 86400_000);
    assert.equal(data.members[0].email, "alice@acme.com");
    assert.equal(data.usage.some((row) => row.requests === 3), true);
    assert.equal(data.usage.some((row) => row.costMicros === BigInt(2_500_000)), true);
  } finally {
    globalThis.fetch = original;
  }
});
