# Usage Accounting Contract

Canonical semantics for requests, tokens, cost, sources, and model visibility across UseJunction.

## Requests

- `requests` means **model calls** or **vendor usage events** (one billed or logged API interaction).
- Never increment requests from:
  - Cursor `ai_code_hashes` row counts
  - AI suggested/accepted lines
  - Git commits
  - Token totals alone

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
- **Cursor verified**: use `chargedCents` from vendor; do not re-price

## Cost kinds

Three non-overlapping categories:

1. **actual_spend** — invoices, subscriptions, seats (manual billing / integrations)
2. **verified_usage** — vendor-reported charges (`chargedCents`, invoice imports)
3. **estimated_api** — locally reconstructed token usage × rate card

Never label a mixed verified+estimated total as "Spend".

## Metric kinds

- **usage** — tokens, model calls, verified/estimated cost
- **productivity** — lines, commits, AI % (no requests/tokens/cost in KPI totals)

## Sources (canonical)

| Source | Meaning | Priority (activity) | Priority (cost) |
|--------|---------|---------------------|-----------------|
| `vendor_verified` | Cursor events, provider API | 0 | 0 |
| `invoice_imported` | Invoice sync | — | 0 |
| `otel_observed` | Claude telemetry | 1 | 3 |
| `device_observed` | Local scan | 2 | 2 |
| `gateway_observed` | Junction gateway | 3 | 1 |
| `estimated` | Rate-card fallback | 4 | 2 |

Legacy aliases normalized at ingest: `local_scan` → `device_observed`, `cursor_usage_events` → `vendor_verified`.

## Models

- Raw model strings are preserved (e.g. `composer-2.5-fast`, `grok-4.5-xhigh`).
- Every distinct model with usage or productivity data must be visible in UI.
- Productivity-only aliases (`ai-lines`, `commits`) appear in a separate section.

## Success rate

Shown only when `request_metadata` has outcome telemetry. Otherwise display "Not measured".

## Calculation version

`calculationVersion` on aggregates tracks parser/pricing changes. Pre-fix rows are marked stale during reconciliation rather than arithmetically corrected in place.

## Metric version (retained analytical buckets)

`metricVersion` (e.g. `metrics-v1`) versions the **analytical rollup recipe** separately from fact `calculationVersion`.

- Facts live in `usage_daily` (immutable upserts via `dedupeKey`).
- Retained day buckets live in `metric_daily_buckets`, keyed by dimensions + `metricVersion`.
- `analytics_watermarks` track how far each org has been materialized for a given version.
- `analytics_dirty_days` mark calendar days that need rematerialization after late ingest.
- Insight reads **re-sum sealed buckets** and live-scan only the gap (dirty days + today).
- Bumping to `metrics-v2` backfills new buckets from facts without rewriting history; readers switch to v2 while v1 rows are retained until an explicit GC.

Cron: `POST /api/cron/materialize-metrics` with `Authorization: Bearer $CRON_SECRET`.

Backfill a version (from `apps/admin`):

```bash
pnpm exec tsx scripts/backfill-metric-buckets.ts --org <orgId>
pnpm exec tsx scripts/backfill-metric-buckets.ts --all --version metrics-v2
```
