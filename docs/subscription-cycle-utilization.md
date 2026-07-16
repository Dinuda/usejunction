# Subscription Cycle Utilization

UseJunction now treats the subscription billing cycle as the primary unit for spend and utilization reporting.

This replaces the older calendar-month framing for subscription metrics. The goal is to answer:

- What am I paying for right now?
- Where is this subscription inside its current billing cycle?
- Is usage keeping pace with the cycle before it renews?

## Core Model

Each subscription has:

- `billingCadence` - `weekly`, `monthly`, `annual`, or `custom`
- `billingCycleAnchorDate` - the start of the current cycle
- `billingCycleDays` - required for `custom` cadence
- `cycleSeatMicros` - cycle price per seat
- `includedCycleMicros` - included allowance per cycle

For existing rows without an explicit cycle anchor, the system backfills from the record creation date. If a renewal date is present, the code can derive the cycle anchor from that date.

The cycle helper computes:

- `cycleStart`
- `cycleEnd`
- `nextRenewalDate`
- `elapsedPercent`
- `remainingDays`

## What Changed

Subscription reporting no longer uses month-based semantics for billing totals.

Before:

- `monthlySeatMicros`
- `includedMonthlyMicros`
- `estimatedMonthlyMicros`
- `billing.month`
- dashboard copy centered on 30-day or monthly windows

Now:

- cycle-based field names and totals
- cycle-aware billing lines
- dashboard cards and timelines keyed to active billing cycles
- operational traffic views still keep short lookbacks like 7, 30, or 90 days

The important split is:

- billing and utilization are cycle-based
- traffic/history charts can still be window-based

## Dashboard Behavior

The admin dashboard now defaults to current billing cycles rather than a date-range selector.

The combined view shows:

- current cycle spend
- verified usage inside the active cycle
- estimated API value inside the active cycle
- model calls inside the active cycle
- upcoming renewals ordered by `nextRenewalDate`

This avoids the misleading assumption that all subscriptions share the same calendar month.

## API And Data Contract

The main read models now expose cycle fields instead of month fields.

- subscription inventory returns cycle pricing and cycle totals
- plan usage returns cycle metadata per subscription and assignment
- org overview includes current-cycle spend and renewal timelines

Vendor quota windows remain unchanged. `monthly` or `weekly` labels on provider quotas still describe the provider's quota window, not the billing cycle model.

## Terminology

Use these terms in UI copy and docs:

- `current billing cycle`
- `cycle spend`
- `cycle utilization`
- `next renewal`
- `cycle start`

Avoid using `monthly` when the system means "current cycle."

## Migration Notes

Existing records are still readable after the rename migration.

- billing price fields were renamed from monthly to cycle terms
- cycle anchors are populated from existing renewal dates or creation dates
- custom cycles require a positive cycle length in days

Historical traffic reporting is unchanged. The system still uses 7/30/90-day windows where the user is looking at activity history rather than subscription billing.
