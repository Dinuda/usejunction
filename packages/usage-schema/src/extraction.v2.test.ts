import { describe, expect, it } from "vitest";
import {
  JUNCTION_EXTRACTION_SCHEMA_VERSION,
  extractionFingerprint,
  sanitizeExtractionPayload,
} from "./extraction.v2";

describe("Junction Extraction Contract v2", () => {
  it("keeps approved metrics and removes prompt/code-bearing fields", () => {
    expect(sanitizeExtractionPayload({
      model: "claude-sonnet",
      input_tokens: 10,
      prompt: "do not persist",
      tool_input: { command: "cat secret" },
      file_path: "/repo/secret.ts",
      repository: { host: "github.com", owner: "acme", name: "app" },
    })).toEqual({
      model: "claude-sonnet",
      input_tokens: 10,
      repository: { host: "github.com", owner: "acme", name: "app" },
    });
  });

  it("produces a stable source fingerprint", () => {
    const input = {
      source: { provider: "anthropic", product: "claude_code", tenantId: "tenant-1", endpoint: "/v1/usage", capability: "usage" },
      externalRecordId: "row-1",
      subject: { externalUserId: "user-1" },
      metric: "gen_ai.usage.input_tokens",
      occurredAt: "2026-08-03T00:00:00.000Z",
      value: 42,
      payload: { input_tokens: 42, prompt: "excluded" },
    };
    expect(extractionFingerprint(input)).toBe(extractionFingerprint({ ...input, payload: { prompt: "excluded", input_tokens: 42 } }));
    expect(JUNCTION_EXTRACTION_SCHEMA_VERSION).toBe("2.0.0");
  });
});

