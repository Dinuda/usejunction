# SaaS billing (Lemon Squeezy)

UseJunction SaaS billing is how **Junction charges customers** for the product.
It is separate from reporting a customer's Cursor/Codex/Claude subscriptions.

Billing integration code lives in the open-source repo. **Secrets never do** — API
keys, webhook signing secrets, and Lemon store/variant IDs are read from server
environment variables at runtime only.

## Plans

| Plan | Developer seats | Devices | Notes |
|------|-----------------|---------|--------|
| `community` | `USER_LIMIT_FREE` (5) | Not metered by SaaS billing | Default for new workspaces |
| `team` | Active roster via Lemon quantity | Not metered by SaaS billing | Lemon Squeezy subscription |
| `enterprise` | Contract-managed | Not metered by SaaS billing | Manual |

Legacy `trial` rows are treated as `community` after the workspace-trial removal
migration.

**Billed unit on Team:** each active developer (`Developer.removedAt IS NULL`).
Invitations do not count until accepted. The minimum checkout quantity is one.

Marketing copy uses `TEAM_PRICE_PER_DEV_USD` ($8 / active developer / month) from
`apps/admin/lib/saas-billing/entitlements.ts`. The configured Lemon variant is the
source of truth for the amount charged and must use **quantity-based**, not
usage-based, billing.

## Checkout and automatic quantity

Clicking **Upgrade to Team** creates checkout immediately without an intermediate
dialog. `POST /api/billing/checkout` recounts the roster and passes that count in
Lemon's `variantQuantities`; Lemon shows the authoritative checkout total. The
API-created checkout overrides the product summary to show `N active members`
and explain that roster changes are reflected automatically on the next bill.

After Team activates, roster additions and removals call
`syncTeamSeatQuantity`. It updates the first subscription item's quantity with:

```ts
{
  quantity: activeSeatCount,
  invoiceImmediately: false,
  disableProrations: false,
}
```

This enables a new seat immediately and defers its prorated current-cycle charge
to the next renewal invoice. Removing a seat creates a prorated unused-time
credit on that invoice. The renewal itself uses the full active quantity then in
effect.

`Organization.lemonSqueezyQuantity` is the last quantity confirmed by an API
response or webhook. A difference from the active roster appears to admins as
`Billing sync pending`.

## Reliability and reconciliation

- Roster changes commit even if Lemon is temporarily unavailable.
- Failed updates are logged and audited as `billing.seat_sync_failed`.
- `POST /api/cron/billing-seat-sync`, authenticated with `CRON_SECRET`, repairs
  all active/on-trial Team subscriptions. Schedule it every five minutes.
- Subscription create, update, and resume webhooks also reconcile against the
  latest roster. This catches roster changes made while checkout was open.
- Quantity syncing is not applied to Enterprise, expired, paused, or cancelled
  subscriptions. Resumed Team subscriptions reconcile immediately.

## Environment

Set all four Lemon variables together when selling Team on a hosted deployment.
Leave them unset for self-hosted installs that do not use Lemon checkout.

```text
LEMONSQUEEZY_API_KEY=
LEMONSQUEEZY_STORE_ID=
LEMONSQUEEZY_VARIANT_ID_TEAM=
LEMONSQUEEZY_WEBHOOK_SECRET=
CRON_SECRET=
NEXT_PUBLIC_APP_URL=
NEXTAUTH_URL=
```

Webhook endpoint: `{NEXT_PUBLIC_APP_URL}/api/webhooks/lemonsqueezy`

Subscribe at least to:

- `subscription_created`, `subscription_updated`, `subscription_resumed`
- `subscription_paused`, `subscription_unpaused`, `subscription_cancelled`
- `subscription_expired`, `subscription_payment_failed`

Checkout custom data must include `org_id` so webhook events can resolve the
workspace.

### Production hardening

`assertSecureProductionEnv()` runs at Next.js build/start when `NODE_ENV=production`.
If **any** Lemon billing variable is set, **all four** must be present and valid:

| Variable | Requirement |
|----------|-------------|
| `LEMONSQUEEZY_API_KEY` | ≥ 32 characters, not a known default |
| `LEMONSQUEEZY_WEBHOOK_SECRET` | ≥ 16 characters, not a known default |
| `LEMONSQUEEZY_STORE_ID` | Non-empty |
| `LEMONSQUEEZY_VARIANT_ID_TEAM` | Non-empty |

Omit every Lemon variable to run production without SaaS checkout (typical for
self-hosted Community installs).

## HTTP surface

| Method | Path | Role |
|--------|------|------|
| POST | `/api/billing/checkout` | owner/admin — checkout using active roster quantity |
| POST | `/api/billing/portal` | owner/admin — customer portal |
| POST | `/api/billing/sync` | owner/admin — refresh subscription state from Lemon |
| POST | `/api/cron/billing-seat-sync` | cron secret — reconcile active Team quantities |
| POST | `/api/webhooks/lemonsqueezy` | Lemon HMAC — update status and confirmed quantity |

Webhook requests are rejected unless `x-signature` matches an HMAC-SHA256 digest
of the raw body using `LEMONSQUEEZY_WEBHOOK_SECRET`.

## Lifecycle

1. New workspaces start on Community (5 developer seats).
2. Upgrade checkout uses the current active roster quantity.
3. The creation webhook activates Team and immediately reconciles roster drift.
4. Accepted joins and provider-imported developers increase quantity; removals
   decrease it. Lemon displays the resulting active seat count.
5. Deferred prorated debits or credits appear on the next renewal invoice.
6. Unpaid or expired Team subscriptions resolve to Community and its seat cap.

Dashboard `?upgraded=1` shows “Subscription updating…” until Team status is
visible.
