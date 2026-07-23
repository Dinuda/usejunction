# UseJunction Usage Schema v1 (UUS)

Aggregate-first daily usage record. Vocabulary aligns with [OpenTelemetry GenAI semantic conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/); transport is **not** OTLP.

See also [Usage Accounting Contract](usage-accounting.md).

## Grain

One record per:

`date × tool × model × source × repository`

Absolute daily totals (replace, never increment).

## Typed core

| Field | OTel / notes |
|-------|----------------|
| `schemaVersion` | `"1.0.0"` |
| `date` | UTC `YYYY-MM-DD` |
| `gen_ai.system` | Provider (optional on wire; server classifies from `tool`) |
| `tool` | UseJunction tool id |
| `gen_ai.request.model` / `model` | Model id |
| `source` | Observation source (legacy aliases normalized server-side) |
| `repository{host,owner,name}` | Optional remote identity |
| `gen_ai.usage.input_tokens` / `output_tokens` / `cache_read_tokens` | Token buckets |
| `cache_write_tokens`, `reasoning_tokens` | Extra buckets |
| `requests` | Model calls |
| `cost{amountMicros,amountUsd,kind}` | Cost with kind |

## Extensions

Namespaced map (additive without migration):

- `code.suggested_lines`, `code.accepted_lines`, `code.added_lines`, `code.deleted_lines`
- `vcs.commits`
- `ai_percent`
- Tool-specific keys under a tool prefix

Legacy camelCase productivity fields on the wire are folded into extensions on normalize.

## Classification (server-authoritative)

Agents emit raw facts. The control plane owns:

- `providerForTool`
- `normalizeCanonicalSource`
- `inferMetricKind`
- `inferCostKind`

Implemented in `apps/admin/lib/usage/classify.ts`.

## Wire compatibility

Ingest accepts both UUS-named fields and legacy camelCase (`toolName`, `inputTokens`, `estimatedCost`, …) used by the current agent. Sync-session chunks prefer UUS v1.

## Schema artifact

Machine-readable: [`packages/usage-schema/schema/uus.v1.json`](../packages/usage-schema/schema/uus.v1.json)

TypeScript: `@usejunction/usage-schema`
