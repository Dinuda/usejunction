# SaaS billing (Lemon Squeezy)

UseJunction SaaS billing is how **Junction charges customers** for the product.
It is unrelated to tracking a customer's Cursor/Codex/Claude seats — that vendor
tool-spend feature was removed.

## Plans

| Plan | Devices | Developer seats | Notes |
|------|---------|-----------------|--------|
| `trial` | Unlimited for `TRIAL_DAYS` (14) | Not metered | Default for new workspaces |
| `community` | `DEVICE_LIMIT_FREE` (10) | Not metered | After trial ends, or unpaid |
| `team` | Unlimited | Purchased via Lemon quantity | Lemon Squeezy subscription |
| `enterprise` | Unlimited | Sales / contact | Manual |

**Billed unit on Team:** developer seats (active roster), not devices.
**Free/community gate:** enrolled devices (10), unchanged.

Effective plan resolution lives in `apps/admin/lib/saas-billing/entitlements.ts`.
Price constant: `TEAM_PRICE_PER_DEV_USD` ($12 / developer / month). The Lemon
variant is the source of truth for charged amount.

## Seat picker at checkout

Upgrade opens a dialog: **How many developer seats?**

- Floor / default = active developers (`removedAt: null`), at least 1.
- Buyer can set a higher number (e.g. 12) even if free tier only allowed 10 devices.
- `POST /api/billing/checkout` body: `{ quantity?: number }`. Rejects quantity below the floor or above `MAX_TEAM_SEATS` (500).

This avoids under-buying when the free device cap hid the true team size.

## After Team is active

`Organization.lemonSqueezyQuantity` is purchased capacity.

- Invites / join / connect that would add a **new** active developer are blocked at capacity with:
  `All N seats are used. Add seats to invite more.`
- Admins use **Add seats** → `POST /api/billing/seats` `{ quantity }` (must be ≥ current roster).
- Re-linking an already-active developer does not consume a seat.
- Member remove best-effort syncs Lemon quantity downward to the roster size.

## Env

```
LEMONSQUEEZY_API_KEY=
LEMONSQUEEZY_STORE_ID=
LEMONSQUEEZY_VARIANT_ID_TEAM=
LEMONSQUEEZY_WEBHOOK_SECRET=
NEXT_PUBLIC_APP_URL=   # also used for checkout redirect
NEXTAUTH_URL=
```

Webhook endpoint: `{NEXT_PUBLIC_APP_URL}/api/webhooks/lemonsqueezy`

Subscribe at least to:

- `subscription_created`, `subscription_updated`, `subscription_resumed`
- `subscription_paused`, `subscription_unpaused`, `subscription_cancelled`
- `subscription_expired`, `subscription_payment_failed`

Checkout custom data must include `org_id` (set by our checkout route).
The Team variant must be **quantity-based** in Lemon Squeezy.

## HTTP surface

| Method | Path | Role |
|--------|------|------|
| POST | `/api/billing/checkout` | owner/admin — create Lemon checkout (`quantity`) |
| POST | `/api/billing/portal` | owner/admin — customer portal |
| POST | `/api/billing/seats` | owner/admin — set purchased seat quantity |
| POST | `/api/billing/sync` | owner/admin — refresh status from Lemon API |
| POST | `/api/webhooks/lemonsqueezy` | Lemon HMAC — update org plan/status/quantity |

Sidebar `PlanStatusCard` drives checkout (with seat picker), portal, and add seats.
Device enroll and enrollment-token minting call `assertCanEnrollDevice`.
Roster growth on paid plans calls `assertCanAddDeveloperSeat`.

## Lifecycle

1. Workspace create → `plan=trial`, `trialEndsAt` set.
2. Upgrade → seat picker → checkout with chosen quantity (≥ roster).
3. Webhook → `plan=team`, Lemon IDs, quantity, period end.
4. Invite beyond seats → 403 until Add seats.
5. Roster shrink → best-effort Lemon quantity sync down.
6. Trial expire without pay → effective plan `community` (10-device cap).

Dashboard `?upgraded=1` shows a short “Subscription updating…” banner until Team
status is visible.
