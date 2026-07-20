# Calculation inventory

This is the discovery pass for calculation and filter testing. It records what each workspace page/tab displays, where the value is calculated, and the edge cases that should become unit or frontend tests. It intentionally does not implement tests yet.

For running golden / local **calculation verification** (page KPIs reconciled against raw data), see [Calculation verification suite](calculation-verification.md).

## Workspace surface map

| Surface | Roles | Tabs / views | User-controlled filters |
|---|---|---|---|
| `/dashboard` | developer, admin, owner | developer personal home; admin/owner overview | `view=current_cycles\|previous_cycles\|last_30_days`; rolling `days`; custom `from`/`to` for last-30 view |
| `/activity` | developer, admin, owner | personal activity or admin activity | none in the page; always 30 days |
| `/tools` | developer, admin, owner | personal tools; admin `Subscriptions` / `Detected activity` | tab only; no metric filter |
| `/tools/[toolKey]` | admin, owner | provider detail | tool key from route |
| `/team` | admin, owner | roster / inventory | selected developers for bulk assignment |
| `/team/[developerId]` | admin, owner | member usage / plans / machines / tools | developer id from route; usage is 30 days |
| `/signals` | admin, owner | overview | cycle view or rolling `days`/custom bounds, person, team, AI tool (URL params) |
| `/signals/activity` | admin, owner | activity table | cycle/rolling period, person, team, AI tool; result limit is 50 |
| `/signals/journeys` | admin, owner | journey rollup table | rolling period, team, AI tool; person options are not shown |
| `/signals/tools` | admin, owner | tool adoption table | rolling period, team; AI-tool selector is hidden |
| `/signals/journeys/[flowKey]` | admin, owner | journey detail | rolling period, person, team, AI tool from URL; filters are read but no filter control is rendered on this page |

Public/auth/onboarding/settings pages were inspected for calculation-bearing code and currently do not expose product metrics. They are out of scope for this calculation inventory; they still need ordinary frontend smoke tests later.

## Shared calculation contracts

### Date and window rules

Source: `apps/admin/lib/metrics/date-range.ts`, `apps/admin/lib/analytics/contracts/time-window.ts`, `apps/admin/lib/signals/queries/windows.ts`.

- Usage windows are UTC calendar-day windows, inclusive at both ends. “Today” is included by querying through tomorrow at exclusive midnight.
- A `days` window ends today and starts at `today - (days - 1)`. Its comparison window is the immediately preceding, same-length window.
- Explicit dashboard bounds normalize `from` and `to` to UTC dates. The previous window ends one day before `from` and has the same number of days.
- Dashboard rolling shortcuts are 7, 14, and 30 days. Obsolete saved shortcuts fall back to 30 days.
- Generic analytics queries reject windows longer than 366 inclusive days and reject an end before the start.
- Signals accepts whole-number `days` values from 1–366 or a complete `from`/`to` pair, defaults to 30 days, and rejects mixed or invalid window modes. Its prior window is the immediately preceding span of equal length.
- All current product metric windows use `grain: "day"` and `timezone: "UTC"`.
- Tests must cover month/year boundaries, today’s records, one-day windows, leap days, custom bounds, invalid bounds, and non-UTC timestamps.

### Canonical usage accounting

Source: `apps/admin/lib/analytics/query/sql.ts`, `apps/admin/lib/metrics/source-priority.ts`.

- Source aliases: `local_scan`/`cursor_local` → device-observed; `cursor_usage_events` → vendor-verified; `cursor_plan_percent` → device-observed.
- Activity source priority is vendor verified, OTEL observed, device observed, gateway observed, estimated.
- Cost source priority is vendor verified/invoice imported, gateway observed, estimated/device observed, OTEL observed.
- Activity and cost are selected independently; one source can win activity while another wins cost for the same day/tool/model key.
- Productivity rows are separate from usage activity. `cursor_local` and explicit `metric_kind=productivity` are productivity; they do not count as model activity.
- Synthetic `estimated` rows do not count as observed activity, but their selected cost is included in the canonical “estimated API value” accumulation. This keeps verified, estimated, and total cost displays consistent without inflating observed model-call counts.
- Available query filters are developer ids, repository ids, tool names, providers, products, models, normalized sources, metric kinds, and cost kinds. Filter arrays are deduped and sorted before execution.
- Measures include requests, sessions, all token types, active seconds, productivity line/commit fields, cost micros, and active developers. Most UI token totals use input + output only; cache and reasoning are displayed separately.

### Money and percentages

- Micros become dollars by dividing by 1,000,000. Billing math stays in `bigint` micros until display/conversion.
- “No prior baseline” is represented as `null`, never `+100%`. When a prior value is positive, change is `round((current - prior) / prior * 100)`.
- Display ratios are clamped to 100%; raw ratios are retained so over-limit usage can display as, for example, 125%.
- Dashboard and roster meters use a minimum visual width (2% or 4%) for positive but tiny values; the numeric label remains the raw/rounded percentage.

## Page-by-page inventory

## 1. Dashboard — `/dashboard`

### Admin/owner overview

Sources: `apps/admin/lib/insights/queries/get-org-overview.ts`, `apps/admin/lib/insights/queries/rollup-subscription-cycles.ts`, `apps/admin/app/(workspace)/dashboard/page.tsx`.

Filters/views:

- `view=current_cycles`: resolve the current billing cycle for each active coding-tool subscription.
- `view=previous_cycles`: resolve the previous billing cycle.
- `view=last_30_days`: despite the name, the selected rolling/custom period is used; overlapping cycles are sliced to the report window.
- Rolling period presets are parsed from `days`; custom periods use `from`/`to`; invalid/inverted custom periods fall back according to `period-prefs`.
- Only coding-tool subscriptions are included in cycle spend (`filterCycleCodingSubscriptions`); all detected tools still appear in the tools/coverage areas.

Calculations:

- KPI “Subscription commitment”: sum of subscription cycle seat micros × purchased seat count. Current/previous cycle views use the full cycle cost. Last-30/custom uses `overlapDays / cycle.totalDays` and rounds prorated micros.
- KPI “Verified usage”: report-window org total of usage rows classified `costKind=verified_usage`, converted to dollars (same scope as chart/tools; not gated on subscriptions).
- KPI “Estimated API value”: report-window org total of selected `costKind=estimated_api` rows, including source `estimated`, converted to dollars (same scope as chart/tools).
- KPI “Model calls”: report-window org total of canonical requests (same scope as the model-calls chart and tools list). Cycle rows still show cycle-allocated calls.
- Subscription-cycle slices use the intersection of cycle and report window. Cycle windows are half-open internally; the displayed end is the last inclusive day.
- For current/previous cycles, usage for identical tool/window groups is allocated across slices by `max(1, seatCount) / max(1, totalSeats)`.
- For last-30/custom, usage is grouped by tool and allocated day by day across active slices using the same seat-weighted share. This prevents overlapping plans from double-counting the same usage.
- Multiple plans for one tool are rolled into one row: spend, verified cost, estimated cost, and model calls sum; earliest window start/latest window end are retained; earliest renewal wins; plan names are sorted.
- Cycle `spendSharePercent` is each rolled tool’s spend divided by total cycle spend, or 0 when total spend is 0.
- Cycle utilization is averaged across plan rows with a raw signal. Raw utilization uses live quota ratio first, otherwise included-allowance ratio. Display utilization averages clamped display ratios separately.
- Worst plan verdict wins using `LIMIT_EXCEEDED > NEAR_LIMIT > DATA_STALE > UNKNOWN > LIGHT_USE > HEALTHY`.
- `daysWithActivity` counts trend days with model calls > 0; `firstActivityDate` is the first active trend date; observation is partial if activity starts after the window or appears on fewer days than the range.
- Coverage bars: active people = `activeDevelopers / developers` capped at 100%; enrolled devices is the active device count; tracked tools is 100% when nonzero, otherwise 0%.
- “Has activity” is true when cycle calls > 0, any merged tool has requests > 0, or there is a detected installation. Empty state additionally requires zero devices.
- Failed requests are restricted to the selected report window, status != success, ordered newest first, limited to five.

Frontend-only calculations/nuances:

- Cycle header averages `utilizationPercent` over rows with a signal and counts near-limit/over-limit rows.
- Meter width clamps to `[2, 100]` for any display ratio; `aria-valuenow` rounds the display ratio. A missing signal renders no numeric value and a 0% bar.
- Coverage active-people bar is capped; the enrolled-device row is present when the active device count is nonzero.
- KPI deltas are rendered as whole percentages and color-positive/negative; current dashboard data currently supplies `null` deltas, which should be explicitly verified.
- Developer route bypasses the admin overview and renders the personal home instead.

### Developer personal home

Sources: `apps/admin/lib/queries/me/overview.ts`, dashboard page, `components/dashboard/ai-coding-panel.tsx`.

- Fixed 30-day UTC window.
- Model calls and sessions come from the summary query.
- Device KPI is the enrolled device count.
- Tools are usage rows plus detected-only tools; each tool shows requests, input+output tokens, and cost.
- AI coding acceptance = `acceptedLines / suggestedLines * 100`, or no percentage when suggested lines is 0.
- AI-driven commits shows `aiPercent` when non-null, otherwise commit count. Current data builder sets `aiPercent` to null.
- AI panel tokens = input + output; cache read/write are separate. Estimated API value = `max(0, total cost - verified cost)`.
- Token bar total = input + output + cache read + cache write; zero-valued segments are removed. Every nonzero segment gets a minimum 2% CSS width, so visual widths can exceed 100% when many tiny segments exist.
- Model tables split usage and productivity rows, search case-insensitively across model/tool/source, use page size 25, reset to page 0 on search, and clamp Previous/Next to valid pages.

## 2. Activity — `/activity`

Sources: `apps/admin/app/(workspace)/activity/page.tsx`, `lib/queries/dashboard/usage.ts`, `lib/queries/dashboard/requests.ts`, `lib/queries/me/overview.ts`.

### Admin/owner tab

- Fixed 30-day usage window; no page filters.
- Tokens = input + output.
- Displays canonical model calls, verified usage cost, and estimated API value.
- Tool/model rows are already grouped by the query layer and display their request count and cost.
- Recent requests fetch up to 20 and render only the first 8.
- Status styling maps success → success, timeout/retry → warning, failed/error → error, everything else → default.

### Developer tab

- Tokens = `BigInt(inputTokens) + BigInt(outputTokens)`.
- Spend = `BigInt(costMicros) / 1,000,000`.
- Tool rows use 30-day requests, input+output tokens, and cost; detected-only tools remain visible with zero usage.
- Signals ledger is limited to 20 newest sessions. Confidence is `round(confidence * 100)`.
- Duration display: under 60 seconds → seconds; under 60 rounded minutes → minutes; otherwise rounded hours. Boundary behavior at 59/60/3599/3600 seconds needs frontend tests.

## 3. Tools — `/tools`

### Developer personal tools

Source: `apps/admin/app/(workspace)/tools/page.tsx`.

- Groups tools across all devices by exact `toolName`.
- Device count increments once per device tool installation; duplicate installations on one device are not deduped.
- Quotas are deduped per tool/window type within the personal view; the first quota encountered wins because devices are traversed in returned order.
- Detected-tools KPI is the number of grouped tools; assigned-plans KPI is the length of `developer.assignedPlans`.
- Quota usage displays `usedPercent` rounded to 0 decimals and retains null as no percentage.

### Admin/owner `Subscriptions` tab

Source: `components/tools/subscription-inventory.tsx` and subscription APIs.

- Groups API subscriptions by catalog tool; groups with no subscriptions are omitted.
- Totals: active tools = group count; purchased seats = sum `seatCapacity`; available seats = sum backend `availableSeats`; cycle cost = sum `estimatedCycleMicros` in bigint micros.
- Per-tool row: purchased = sum item capacity; assigned = sum item assigned seats; available is recalculated as purchased − assigned; cycle cost sums item estimated cycle micros.
- Note the intentional verification point: the global available total trusts `availableSeats`, while each tool row recalculates it.
- Default tab is `activity` if any tool has quotas or installed devices; otherwise `subscriptions`.

### Admin/owner `Detected activity` tab

- Rows are precomputed for the last 7 days: installed devices, requests, input+output tokens, and cost.
- Tools are sorted by requests descending, then name ascending in the query layer.
- Only the first eight quota snapshots per tool are rendered.
- Quota chips render usage toFixed(0) and the localized reset date; null usage/reset stays omitted.

## 4. Tool provider detail — `/tools/[toolKey]`

Sources: `lib/queries/dashboard/tool-detail.ts`, `components/tools/tool-provider-detail.tsx`.

- Tool route resolves a catalog tool and queries the canonical name plus aliases.
- 7-day requests and input+output tokens sum across source-dimension rows.
- 7-day usage cost sums selected canonical costs, including source `estimated`; observed request counts still exclude synthetic estimated activity.
- People are a union of detected installations, tool accounts, and active assignments, keyed by developer. The display is alphabetic by name.
- A detected plan is mapped to a catalog plan. `planMismatch` is true only when mapped vendor and assigned catalog keys differ and assignment source is `detected`.
- Devices are deduped by installation `deviceId`; people count is the size of the union.
- Purchased/assigned seats sum plan capacities/assignments; free seats are `max(0, purchased − assigned)`.
- Quotas are deduped by window type + device hostname; first returned row wins.
- UI counts detected and assigned people independently from the union.
- Seat updates are blocked client-side when requested capacity is below assigned seats.

## 5. Team — `/team` and `/team/[developerId]`

### Roster page

Sources: `app/(workspace)/team/page.tsx`, `components/developers/developer-tool-inventory.tsx`, `components/developers/roster-plan-usage.tsx`.

- Members = roster length.
- Enrolled machines uses the active dashboard device count.
- Requests KPI sums each developer’s `requests7d` and displays compact notation.
- Inventory summary: covered people = developers with at least one manual plan / total developers; needs a plan = detected tools exist and manual plan count is zero; available seats = sum subscription `availableSeats`.
- Bulk assignment is offered only when more than one developer exists and at least one subscription has a positive available seat count. Assignment requests one seat per selected developer.
- Detected tools per developer are the sorted set union of device installations and tool evidence.
- Per-member metadata shows the enrolled machine count and requests only when requests7d > 0.
- Roster plan meter averages only plans with non-null `primaryRatio`; it does not weight by seats. Verdict is the worst-ranked plan verdict. Meter width clamps to `[4, 100]`; no-signal plans show chips but no aggregate percentage.

### Member detail

Sources: `app/(workspace)/team/[developerId]/page.tsx`, `components/developers/member-plan-usage.tsx`.

- Fixed 30-day window.
- Requests = summary requests; tokens = input + output; spend = cost micros / 1,000,000.
- Machines are represented by enrollment and last-heartbeat timestamps, without an online/offline state.
- Plan usage uses live primary quota when available, falling back to included allowance; raw percentage can exceed 100%, display bar is clamped.
- Included allowance shows gross usage of included cycle allowance; plans with zero include show “seat cost only”.
- Member plan summary uses server-provided average utilization and developer verdict.

## 6. Signals — overview and tabs

Shared filters: `components/signals/signals-filters.tsx`, `lib/signals/queries/windows.ts`, `lib/signals/readers/sessions.ts`.

- The shared rolling-period picker offers 7/14/30-day shortcuts plus custom dates. The API can resolve any whole-number 1–366-day window.
- Optional filters: `developerId`, `teamId`, `tool`. Empty selection removes the parameter. Hidden controls are not added to the URL even if a value exists.
- Session query uses UTC `startedAt >= from` and `< day after to`, newest first, with a default in-memory read cap of 2,000. Activity overrides the cap with 1–200, default 50.
- Filter options are all org developers, teams, and distinct session AI tools, each sorted by name/tool.
- Journey flow precedence is domain before app, AI tool, domain after app; missing endpoints become `unknown`. Flow keys lowercase/trim/URI-encode each part and join with `__`.

### `/signals` overview

Sources: `lib/signals/queries/get-signals-overview.ts`, `lib/signals/policies/rollup.ts`, `lib/signals/policies/insight.ts`.

- Sessions = current session count.
- Active people = distinct developer ids.
- Time around AI = sum of duration seconds, not average.
- KPI change percentages use the prior window; prior <= 0 yields null.
- Top journey/tool rows sort by sessions descending, people descending; overview shows the first 10 and top-tools UI shows the first 5.
- Journey median duration sorts values and uses the middle value, averaging and rounding even pairs. Journey average duration is sum / session count rounded.
- Tool duration is summed, not averaged. Tool share is `round(tool sessions / total current sessions * 100)`, 0 when total is 0.
- Weekly trend buckets by Monday-start UTC week, fills missing weeks in the window with zero rows, sorts ascending, and has a 200-iteration guard.
- Top-journey share = rounded top-journey sessions / current sessions × 100, or 0 with no sessions.
- Recommended action: boundaries when policy off; null when enabled/no sessions; dominant journey when share >= 20%; otherwise top tool; otherwise browse journeys.
- Insight branch thresholds: first/no baseline, dominant journey >= 25%, lead tool >= 60%, top two tools >= 70%, meaningful change absolute >= 20%. Browser-loop wording has additional browser-label detection.
- Tool share bar clamps CSS width to `[0, 100]`, while displayed share is the rounded raw value.

### `/signals/activity`

- Shows up to 50 filtered current-window sessions.
- Duration is the raw session duration formatted with the shared seconds/minutes/hours rounding rules.
- Relative “when” uses `Date.now()`: <1 minute, <1 hour, <1 day, <1 week, otherwise localized month/day. This is time-dependent and needs a fake-clock frontend test.
- Confidence is rounded to a whole percentage.

### `/signals/journeys`

- Aggregates current and prior filtered sessions by flow key.
- Shows distinct people, session count, median duration, and current-vs-prior session change. New journeys with no prior baseline show `—`.
- Only range/team/tool controls are rendered; developer filter is supported by the backend contract but absent from this page UI.

### `/signals/tools`

- Aggregates current/prior sessions by AI tool.
- Shows sessions, distinct people, total duration, rounded session share, and change percentage.
- Only range/team controls are rendered; tool selector is intentionally hidden because the page is the tool rollup itself.

### `/signals/journeys/[flowKey]`

- Invalid flow keys produce not-found behavior.
- Current/prior sessions are first queried using the flow’s AI tool, then filtered in memory by the complete flow key.
- People = distinct current developer ids; sessions = current count; change = current vs prior count.
- Step labels use domain then app then `unknown`.
- Step duration is rounded `(ended − started) / 1000`; missing, invalid, or backwards timestamps become 0 seconds and are excluded from step median values.
- Steps are grouped by array index, not by label. The most frequent label wins each index; ties retain the first encountered label. Median step duration ignores zero values.
- Overall median journey duration includes every session’s `durationSeconds`, including zero values.
- The detail page accepts person/team/tool query params but does not render `SignalsFilters`; this should be covered as a URL/API behavior test.

## Supporting calculation-bearing components

- `components/dashboard/ai-coding-panel.tsx`: acceptance percentage, estimated-value subtraction, token total, cache total per model, search matching, pagination, and minimum-width token bars.
- `components/developers/member-plan-usage.tsx`: micro-to-dollar conversion, raw/display quota and included ratios, clamped bar width.
- `components/developers/roster-plan-usage.tsx`: unweighted average, worst verdict, signal count, clamped aggregate meter.
- `components/tools/add-subscription-sheet.tsx`: dollars-to-micros uses `Math.round(Number(value || 0) * 1_000_000)`; annual catalog price is displayed as monthly price × 12; seats are clamped to plan minimum; custom cadence requires cycle days; custom price/rates are optional fields sent only when nonempty.
- `components/tools/subscription-inventory.tsx`: bigint cycle totals, seat totals, grouping, tab default, and the purchased-minus-assigned per-tool availability calculation.
- `components/signals/signals-ui.tsx`: duration and change formatting, plus flow parsing/role assignment in `FlowPath`.

## Existing test coverage and missing frontend coverage

Existing calculation-focused tests cover date ranges, analytics normalization/source priority, billing, actual spend, plan utilization, subscription-cycle rollups, quota labels, Signals aggregate helpers/insights, tool catalog, and device presence. Relevant files are under `apps/admin/tests/`.

The main gaps for the next pass are:

1. Server query/composer tests for full Dashboard, Activity, Tools, Team, and Signals response shapes with mocked data.
2. Boundary/property tests for cycle slicing, overlapping subscription allocation, source precedence, and zero/negative/null values.
3. Component tests for all filters, tabs, search/pagination, meter widths, empty states, seat controls, and error states.
4. Route-level frontend tests for every role and every Signals URL filter combination.
5. A small number of browser tests for navigation/debounce, current-time labels, tab defaults, and rendered numeric values.

## Priority test modules

1. `date-range-and-window-contracts`
2. `canonical-usage-accounting`
3. `billing-cycles-and-spend`
4. `plan-quota-utilization`
5. `dashboard-overview-composer`
6. `personal-and-activity-overview`
7. `tools-and-subscription-tabs`
8. `team-roster-and-member-usage`
9. `signals-rollups-and-filters`
10. `calculation-rendering-components`
