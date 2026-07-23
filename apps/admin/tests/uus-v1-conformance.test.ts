import { describe, expect, it } from "vitest";
import {
  UUS_SCHEMA_VERSION,
  normalizeUusWireRecord,
  uusContentFingerprint,
  uusPartitionKey,
} from "@usejunction/usage-schema";
import { classifyUusRecord, providerForTool } from "@/lib/usage/classify";

describe("UUS v1 conformance", () => {
  it("normalizes legacy camelCase wire rows", () => {
    const row = normalizeUusWireRecord({
      date: "2026-07-21",
      toolName: "codex",
      model: "gpt-5.6-sol",
      source: "local_scan",
      inputTokens: 100,
      outputTokens: 20,
      estimatedCost: 1.5,
      requests: 3,
    });
    expect(row).toMatchObject({
      schemaVersion: UUS_SCHEMA_VERSION,
      date: "2026-07-21",
      tool: "codex",
      model: "gpt-5.6-sol",
      inputTokens: 100,
      outputTokens: 20,
      estimatedCost: 1.5,
    });
    expect(row?.["gen_ai.usage.input_tokens"]).toBe(100);
  });

  it("classifies provider and sources server-side", () => {
    const row = normalizeUusWireRecord({
      date: "2026-07-21",
      tool: "claude",
      model: "opus",
      source: "local_scan",
      inputTokens: 10,
      estimatedCost: 0.5,
    });
    expect(row).toBeTruthy();
    const classified = classifyUusRecord(row!);
    expect(classified.provider).toBe("anthropic");
    expect(classified.canonicalSource).toBe("device_observed");
    expect(classified.costKind).toBe("estimated_api");
    expect(providerForTool("codex")).toBe("openai");
  });

  it("builds stable partition keys and fingerprints", () => {
    const row = normalizeUusWireRecord({
      date: "2026-07-21",
      tool: "cursor",
      model: "gpt-4.1",
      source: "local_scan",
      inputTokens: 5,
      repository: { host: "GitHub.com", owner: "acme", name: "app" },
    });
    expect(row).toBeTruthy();
    expect(uusPartitionKey({
      date: row!.date,
      tool: row!.tool,
      model: row!.model ?? "",
      source: row!.source,
      repository: row!.repository,
    })).toBe("2026-07-21|cursor|gpt-4.1|local_scan|github.com/acme/app");
    expect(uusContentFingerprint(row!).startsWith("in:5,")).toBe(true);
  });
});
