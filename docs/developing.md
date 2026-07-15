# Developing across community and commercial

UseJunction now ships as two repositories. This guide is the day-to-day checklist for
where code belongs and how to keep the split healthy.

## The rule of thumb

Ask one question before you write code:

> **Is this feature required for a self-hosted community install with no UseJunction SaaS account?**

| Answer | Where it goes |
| --- | --- |
| Yes | `usejunction` (this repo) |
| No — marketing, hosted billing, trials, upgrades, device limits | `usejunction-commercial` |

When unsure, default to **community** and expose a seam instead of importing commercial code.

## What belongs in community

- Agent, ingestion, auth, workspaces, dashboards, insights, integrations
- Vendor subscription **cost accounting** (Cursor/Codex/Claude spend tracking)
- Security controls, migrations, and tests that protect self-hosted installs
- Neutral extension points such as `apps/admin/lib/commercial/provider.ts`

## What belongs in commercial

- `usejunction.dev` marketing site and contact funnel
- Lemon Squeezy checkout, portal, webhooks
- Trials, paid entitlements, device enrollment limits
- Plan status / upgrade UI
- Additive Prisma fields and migrations for SaaS billing

## Extension seams (community)

Community code should call commercial behavior only through seams:

```ts
import { commercialFeatures } from "@/lib/commercial/provider";

await commercialFeatures.assertCanEnrollDevice(orgId);
const defaults = commercialFeatures.workspaceDefaults();
```

Community `provider.ts` implements permissive defaults:

- plan: `community`
- unlimited device enrollment
- no checkout or portal routes

Commercial replaces that provider at overlay time.

## Before every community PR

Run locally:

```sh
pnpm test
pnpm check:community-boundary
pnpm build
```

CI also runs security smoke checks and dependency scans.

**Do not add to community:**

- `@lemonsqueezy/lemonsqueezy.js`
- marketing homepage components under `components/public/`
- SaaS billing routes under `app/api/billing/checkout`, `portal`, or `webhooks/lemonsqueezy`
- Lemon Squeezy columns on `Organization` in `schema.prisma`

`pnpm check:community-boundary` fails the build if those reappear.

## Working on commercial features

1. Clone both repos side by side.
2. Check out the pinned community commit from `usejunction-commercial/core.lock.json`.
3. Apply the overlay:

```sh
cd usejunction-commercial
pnpm core:prepare ../usejunction
pnpm --dir core install
pnpm --dir core db:generate
pnpm --dir core db:migrate
pnpm --dir core build
```

4. Implement billing or marketing changes in `usejunction-commercial` first.
5. If community needs a new seam (a function the commercial provider can override), add the
   **neutral community implementation** in `usejunction`, then wire the commercial override in
   `overlays/core/`.

6. After merging community changes, bump `core.lock.json` to the new commit and re-run overlay
   verification:

```sh
pnpm core:verify ../usejunction
pnpm core:apply ../usejunction --allow-dirty
```

## Database changes

| Change type | Repository |
| --- | --- |
| Core tables, security columns, community defaults | `usejunction/packages/db` |
| SaaS billing columns, `PlanInterest`, Lemon Squeezy indexes | `usejunction-commercial/packages/billing/prisma` |

Commercial migrations are **additive only**. Community migrations must not assume hosted billing
columns exist.

## Typical workflows

### Product bug in dashboards (community)

Edit `usejunction` only. No overlay refresh needed unless you changed a seam signature.

### Add a new paid-plan limit

1. Add the limit check to `packages/billing` in commercial.
2. Add or extend a method on the community seam (`lib/commercial/provider.ts`) with a permissive
   default.
3. Call that seam from the community route (for example enrollment).
4. Override the provider in `overlays/core/apps/admin/lib/commercial/`.

### Marketing copy or homepage

Edit `usejunction-commercial/apps/marketing` only. Never import the admin app or Prisma.

### New API route

Decide edition first:

- Machine/device route → community, and add it to `lib/machine-auth-routes.ts` if it bypasses session auth.
- Checkout/webhook → commercial overlay route only.

## Mental model

```text
usejunction.dev          app.usejunction.dev
     |                          |
apps/marketing          community admin + commercial overlay
(commercial repo)       (commercial repo applies onto pinned community core)
```

Community is the **kernel**. Commercial is a **private layer** pinned to an exact community commit.

## When you merge community to main

Someone (or CI) should:

1. Update `core.lock.json` in `usejunction-commercial` to the new commit SHA.
2. Run `pnpm core:verify` and `pnpm core:apply`.
3. Run `pnpm check` in the commercial workspace.
4. Deploy marketing and product images independently.

## Quick red flags

Stop and move the change if you are:

- importing `@usejunction/commercial` from community source
- adding `trialEndsAt` or Lemon Squeezy IDs to community `schema.prisma`
- putting homepage hero sections back into `apps/admin`
- storing raw device or invite tokens in the database
- trusting client-supplied `orgId`, `verified`, or billing state

Those were deliberate community-boundary decisions.
