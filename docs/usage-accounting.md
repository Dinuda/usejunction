# Usage Accounting Contract

Canonical semantics for requests, tokens, cost, sources, and model visibility across UseJunction.

For the runtime query architecture that executes this contract, see [Central Analytics Engine](central-analytics-engine.md).
For verifying page KPIs against this contract, see [Calculation verification suite](calculation-verification.md).

## Requests

- `requests` means **model calls** or **vendor usage events** (one billed or logged API interaction).
- **Free, $0, and auto-detected tools still count.** Device-observed usage from OpenCode, Copilot free, local models, and similar tools must appear in `requests` / model-call KPIs so admins can see what their users are running even when spend is zero.
- Never increment requests from:
  - Cursor `ai_code_hashes` row counts
  - AI suggested/accepted lines
  - Git commits
  - Token totals alone
  - `metric_kind = productivity` rows (lines / commits / AI %) — those stay visible as productivity, not as model calls

## Token buckets

Provider-native semantics are preserved:

| Provider | Input | Cache read | Cache write | Output | Reasoning |
|----------|-------|------------|-------------|--------|-----------|
| Codex (OpenAI) | `input_tokens` includes cached subset | `cached_input_tokens` | N/A | `output_tokens` | `reasoning_output_tokens` (subset of output) |
| Claude | `input_tokens` | `cache_read_input_tokens` | `cache_creation_input_tokens` | `output_tokens` | N/A |
| Cursor events | `inputTokens` | `cacheReadTokens` | `cacheWriteTokens` | `outputTokens` | N/A |

### Billing input tokens

- **OpenAI/Codex**: `billable_input = max(input - cache_read, 0)`
- **Anthropic/Claude**: bill uncached input, cache read, cache write, and output as separate additive buckets
- **Cursor verified**: use `chargedCents` from vendor when billable; when included usage reports `chargedCents = 0`, rate-card estimate as `estimated_api` (do not label $0 included usage as `verified_usage`)

## Cost kinds

Three non-overlapping categories:

1. **actual_spend** — invoices, subscriptions, seats, and current billing-cycle spend (manual billing / integrations)
2. **verified_usage** — vendor-reported charges (`chargedCents`, invoice imports)
3. **estimated_api** — locally reconstructed token usage × rate card

Never label a mixed verified+estimated total as "Spend".

## Metric kinds

- **usage** — tokens, model calls, verified/estimated cost
- **productivity** — lines, commits, AI % (no requests/tokens/cost in KPI totals)

Classification is server-authoritative (`apps/admin/lib/usage/classify.ts`):

- Explicit `metric_kind = productivity` on the wire
- Legacy productivity sources: `cursor_local`, `opencode_local`
- Line/commit-only rows with zero input/output tokens
- Productivity rows never win `selected_activity` in analytics SQL, even when `requests > 0` on the stored row
- Ingest may preserve `requests` on productivity rows whose model id starts with `tool:` or `flow:` (Codex/Work tool-call inventory); those counts are for row display only and do not inflate model-call KPIs

## Sources (canonical)

| Source | Meaning | Priority (activity) | Priority (cost) |
|--------|---------|---------------------|-----------------|
| `vendor_verified` | Cursor events, provider API | 0 | 0 |
| `invoice_imported` | Invoice sync | — | 0 |
| `otel_observed` | Claude telemetry | 1 | 3 |
| `device_observed` | Local scan | 2 | 2 |
| `gateway_observed` | Junction gateway | 3 | 1 |
| `estimated` | Rate-card fallback | 4 | 2 |

Legacy aliases normalized at ingest:

| Alias | Canonical |
|-------|-----------|
| `local_scan`, `cursor_local`, `cursor_plan_percent` | `device_observed` |
| `antigravity_local`, `antigravity_usage` | `device_observed` |
| `opencode_local`, `opencode_usage` | `device_observed` |
| `cursor_usage_events` | `vendor_verified` |

`cursor_local` and `opencode_local` keep their raw source for productivity classification even though activity priority treats them as device-observed.

## Models

- Raw model strings are preserved (e.g. `composer-2.5-fast`, `grok-4.5-xhigh`).
- Every distinct model with usage or productivity data must be visible in UI.
- Productivity-only aliases (`ai-lines`, `commits`) appear in a separate section.

## Success rate

Shown only when `request_metadata` has outcome telemetry. Otherwise display "Not measured".

## Calculation version

`calculationVersion` on aggregates tracks parser/pricing changes. Pre-fix rows are marked stale during reconciliation rather than arithmetically corrected in place.
