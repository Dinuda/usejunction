import { describe, expect, it } from "vitest";
import {
  attachRepositoryIds,
  buildUsageDedupeKey,
  inferCostKind,
  inferMetricKind,
  normalizeCanonicalSource,
  normalizeLocalUsageRows,
  providerForTool,
  repositoryKey,
} from "@/lib/ingest/local-usage-batch";

describe("local-usage-batch normalize", () => {
  it("maps providers and canonical sources", () => {
    expect(providerForTool("claude")).toBe("anthropic");
    expect(providerForTool("codex")).toBe("openai");
    expect(providerForTool("cursor")).toBe("cursor");
    expect(normalizeCanonicalSource("local_scan")).toBe("device_observed");
    expect(normalizeCanonicalSource("cursor_usage_events")).toBe("vendor_verified");
    expect(normalizeCanonicalSource("otel_observed")).toBe("otel_observed");
  });

  it("infers productivity metric kind for cursor_local and line-only rows", () => {
    expect(inferMetricKind({ date: "2026-07-21", toolName: "cursor" }, "cursor_local")).toBe("productivity");
    expect(
      inferMetricKind(
        { date: "2026-07-21", toolName: "cursor", suggestedLines: 10, acceptedLines: 4 },
        "local_scan",
      ),
    ).toBe("productivity");
    expect(
      inferMetricKind(
        { date: "2026-07-21", toolName: "codex", inputTokens: 10, outputTokens: 2, requests: 1 },
        "local_scan",
      ),
    ).toBe("usage");
  });

  it("infers cost kinds from verified / estimated signals", () => {
    expect(inferCostKind({ date: "d", toolName: "t" }, "local_scan", 0)).toBeNull();
    expect(inferCostKind({ date: "d", toolName: "t", verified: true }, "local_scan", 1.2)).toBe("verified_usage");
    expect(inferCostKind({ date: "d", toolName: "t" }, "cursor_usage_events", 1.2)).toBe("verified_usage");
    expect(inferCostKind({ date: "d", toolName: "t" }, "local_scan", 1.2)).toBe("estimated_api");
  });

  it("drops invalid rows and builds dedupe keys", () => {
    const rows = normalizeLocalUsageRows(
      [
        { date: "2026-07-21", toolName: "codex", model: "gpt", inputTokens: 100, outputTokens: 20, requests: 3, estimatedCost: 0.5 },
        { date: "not-a-date", toolName: "codex" },
        { date: "2026-07-21", toolName: "" },
        { date: "2026-07-21", toolName: "cursor", source: "cursor_local", suggestedLines: 5, acceptedLines: 2 },
        { date: "2026-07-20", toolName: "codex", estimatedCost: -1 },
      ],
      { deviceId: "device-1" },
    );

    expect(rows).toHaveLength(2);
    expect(rows[0].dedupeKey).toBe(
      buildUsageDedupeKey({
        deviceId: "device-1",
        dateKey: "2026-07-21",
        toolName: "codex",
        model: "gpt",
        source: "local_scan",
        repositoryId: null,
      }),
    );
    expect(rows[0].canonicalSource).toBe("device_observed");
    expect(rows[0].costMicros).toBe(BigInt(500_000));
    expect(rows[1].metricKind).toBe("productivity");
    expect(rows[1].requests).toBe(0);
  });

  it("preserves productivity requests for tool:/flow: models", () => {
    const [row] = normalizeLocalUsageRows(
      [
        {
          date: "2026-07-21",
          toolName: "codex",
          model: "tool:shell",
          source: "local_scan",
          metricKind: "productivity",
          requests: 9,
          suggestedLines: 1,
        },
      ],
      { deviceId: "device-1" },
    );
    expect(row.requests).toBe(9);
  });

  it("attaches repository ids into dedupe keys", () => {
    const normalized = normalizeLocalUsageRows(
      [
        {
          date: "2026-07-21",
          toolName: "codex",
          model: "gpt",
          repository: { host: "GitHub.com", owner: "acme", name: "demo" },
          inputTokens: 1,
        },
      ],
      { deviceId: "device-1" },
    );
    const key = repositoryKey({ host: "github.com", owner: "acme", name: "demo" });
    const attached = attachRepositoryIds(normalized, "device-1", new Map([[key, "repo-123"]]));
    expect(attached[0].repositoryId).toBe("repo-123");
    expect(attached[0].dedupeKey).toContain(":repo-123");
  });
});

describe("local-usage-batch ingest", () => {
  it("bulk upserts idempotently", { skip: !process.env.DATABASE_URL }, async () => {
    const { prisma } = await import("@usejunction/db");
    const { ingestLocalUsageBatch } = await import("@/lib/ingest/local-usage-batch");
    const suffix = Date.now();
    const orgId = `bulk_org_${suffix}`;
    const userId = `bulk_dev_${suffix}`;
    const deviceId = `bulk_device_${suffix}`;

    await prisma.organization.create({ data: { id: orgId, name: "Bulk", slug: orgId } });
    await prisma.developer.create({
      data: { id: userId, orgId, name: "Bulk Dev", email: `bulk_${suffix}@example.com`, role: "user" },
    });
    await prisma.device.create({
      data: {
        id: deviceId,
        orgId,
        userId,
        hostname: "test",
        os: "darwin",
        architecture: "arm64",
        agentVersion: "0.0.0",
        deviceToken: `tok_${suffix}`,
      },
    });

    try {
      const rows = Array.from({ length: 50 }, (_, i) => ({
        date: "2026-07-21",
        toolName: "codex",
        model: `model-${i}`,
        inputTokens: 100 + i,
        outputTokens: 10,
        requests: 1,
        estimatedCost: 0.01,
        source: "local_scan" as const,
      }));

      const first = await ingestLocalUsageBatch({ orgId, userId, deviceId, rows });
      const second = await ingestLocalUsageBatch({
        orgId,
        userId,
        deviceId,
        rows: rows.map((row) => ({ ...row, inputTokens: row.inputTokens + 5 })),
      });

      expect(first.upserted).toBe(50);
      expect(second.upserted).toBe(50);
      expect(await prisma.usageDaily.count({ where: { orgId } })).toBe(50);
      expect(await prisma.localUsageAggregate.count({ where: { orgId } })).toBe(50);

      const updated = await prisma.usageDaily.findFirst({
        where: { orgId, model: "model-0" },
        select: { inputTokens: true, source: true },
      });
      expect(updated?.source).toBe("device_observed");
      expect(updated?.inputTokens).toBe(BigInt(105));
    } finally {
      await prisma.usageDaily.deleteMany({ where: { orgId } });
      await prisma.localUsageAggregate.deleteMany({ where: { orgId } });
      await prisma.device.deleteMany({ where: { orgId } });
      await prisma.developer.deleteMany({ where: { orgId } });
      await prisma.organization.delete({ where: { id: orgId } });
    }
  });
});
