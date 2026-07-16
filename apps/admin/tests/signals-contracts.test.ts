import assert from "node:assert/strict";
import { test } from "vitest";
import { containsForbiddenSignalsField, signalsIngestSchema } from "../lib/signals/contracts";

test("signals ingest accepts domain-level sessions", () => {
  const parsed = signalsIngestSchema.safeParse({
    sessions: [{
      localId: "sig_abc123",
      startedAt: "2026-07-15T10:04:00.000Z",
      endedAt: "2026-07-15T10:12:00.000Z",
      durationSeconds: 480,
      aiTool: "chatgpt",
      appBefore: "Chrome",
      domainBefore: "hubspot.com",
      appAfter: "Microsoft Teams",
      domainAfter: null,
      flowSignature: "crm_to_chatgpt_to_chat",
      confidence: 0.74,
      collectionMode: "app_domain",
      steps: [
        { app: "Chrome", domain: "hubspot.com", startedAt: "2026-07-15T10:01:00.000Z", endedAt: "2026-07-15T10:04:00.000Z" },
        { app: "Chrome", domain: "chatgpt.com", startedAt: "2026-07-15T10:04:00.000Z", endedAt: "2026-07-15T10:12:00.000Z" },
      ],
    }],
  });
  assert.equal(parsed.success, true);
});

test("signals privacy guard detects forbidden nested fields", () => {
  const forbidden = containsForbiddenSignalsField({
    sessions: [{
      localId: "sig_abc123",
      metadata: { prompt: "please do not upload me" },
    }],
  });
  assert.equal(forbidden, "prompt");
});
