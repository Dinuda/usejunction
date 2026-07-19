# SaaS billing (Lemon Squeezy)

UseJunction SaaS billing is how **Junction charges customers** for the product.
It is separate from reporting a customer's Cursor/Codex/Claude subscriptions.

## Plans

| Plan | Devices | Developer seats | Notes |
|------|---------|-----------------|--------|
| `trial` | Unlimited for `TRIAL_DAYS` (14) | Not metered | Default for new workspaces |
| `community` | `DEVICE_LIMIT_FREE` (10) | Not metered | After trial ends, or unpaid |
| `team` | Unlimited | Active roster via Lemon quantity | Lemon Squeezy subscription |
| `enterprise` | Unlimited | Contract-managed | Manual |

**Billed unit on Team:** each active developer (`Developer.removedAt IS NULL`).
Invitations do not count until accepted. The minimum checkout quantity is one.

The Team price is represented in application copy by `TEAM_PRICE_PER_DEV_USD`
($12 / active developer / month). The configured Lemon variant is the source of
truth for the amount charged and must use **quantity-based**, not usage-based,
billing.

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

## HTTP surface

| Method | Path | Role |
|--------|------|------|
| POST | `/api/billing/checkout` | owner/admin — checkout using active roster quantity |
| POST | `/api/billing/portal` | owner/admin — customer portal |
| POST | `/api/billing/sync` | owner/admin — refresh subscription state from Lemon |
| POST | `/api/cron/billing-seat-sync` | cron secret — reconcile active Team quantities |
| POST | `/api/webhooks/lemonsqueezy` | Lemon HMAC — update status and confirmed quantity |

## Lifecycle

1. Workspace creation starts a 14-day trial.
2. Upgrade checkout uses the current active roster quantity.
3. The creation webhook activates Team and immediately reconciles roster drift.
4. Accepted joins and provider-imported developers increase quantity; removals
   decrease it. Lemon displays the resulting active seat count.
5. Deferred prorated debits or credits appear on the next renewal invoice.
6. Trial expiry without payment resolves to Community and its device cap.

Dashboard `?upgraded=1` shows “Subscription updating…” until Team status is
visible.
