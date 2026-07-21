# Production deployment

How hosted UseJunction (`https://usejunction.dev`) is deployed and what you must configure before go-live.

## Architecture (hosted)

| Piece | How it ships |
|-------|----------------|
| Admin / control plane (`apps/admin`) | **Vercel** project `admin`, root directory `apps/admin` |
| Product database | Managed Postgres (`DATABASE_URL` on Vercel) |
| Agent binaries (OTA) | GitHub Releases + protect promote workflow — see [agent-releases.md](./agent-releases.md) |

There is **no** GitHub Actions workflow that deploys the web app. Merges to `main` (with the Vercel Git integration) deploy the control plane. Agent updates are a separate tag → promote path.

Self-hosting uses Docker Compose under `infra/` and is out of scope here.

## Vercel project settings

Confirm in the Vercel dashboard (or local `.vercel/project.json`):

- Framework: Next.js
- Root Directory: `apps/admin`
- Install Command: `cd ../.. && corepack enable && pnpm install --frozen-lockfile`
- Build: `apps/admin/vercel.json` generates Prisma, enforces client/server import boundaries, runs `next build`, then asserts that application UI routes were prerendered
- Domains: `usejunction.dev` (www / `.com` redirect to apex via `next.config.ts`)

## Database migrations

Vercel does **not** run Prisma migrations on deploy. After schema changes:

```bash
DATABASE_URL='postgresql://…' pnpm --filter @usejunction/db exec prisma migrate deploy
```

Apply against the **production** database before or immediately after shipping code that depends on the migration.

## Database connection and function region

Authenticated page models are served by `/api/app/*`, so database placement is part of the request latency budget:

- `DATABASE_URL` must be the provider's pooled, Prisma-compatible runtime URL (not a direct single-connection endpoint). Keep a direct URL only for migration tooling when the provider requires it.
- Set the Vercel Function Region to the supported region closest to the primary Postgres region. Do not choose from the visitor location alone.
- Verify a preview from that region using the `Server-Timing` response header (`session`, `membership`, `data`, and `total` where applicable) before promotion. Warm `/api/auth/session` p95 must remain below 300 ms, workspace-context below 750 ms, page-data below 1.5 seconds, and cold page-data below 3 seconds.
- Investigate measured slow SQL before adding an index. The application endpoints aggregate and parallelize independent readers first.

## Required environment variables (Vercel Production)

Set these on the `admin` project for **Production**. Build/runtime fail closed without the secrets marked required.

### Core (required)

| Variable | Notes |
|----------|--------|
| `DATABASE_URL` | Production Postgres connection string |
| `AUTH_SECRET` | `openssl rand -base64 48` |
| `INGEST_SECRET` | `openssl rand -base64 48` |
| `CRON_SECRET` | `openssl rand -base64 48` |
| `AGENT_RELEASE_OPERATIONS_TOKEN` | `openssl rand -base64 32` — **same value** as GitHub `agent-production` |
| `INTEGRATION_ENCRYPTION_KEY` | `openssl rand -base64 32` (must decode to 32 bytes) |
| `NEXTAUTH_URL` | `https://usejunction.dev` |
| `NEXT_PUBLIC_APP_URL` | `https://usejunction.dev` |
| `AUTH_TRUST_HOST` | `true` |
| `USEJUNCTION_ALLOW_INSECURE_DEVELOPMENT` | omit or `false` |

### Auth email (required for invites / reset / magic links)

| Variable | Notes |
|----------|--------|
| `RESEND_API_KEY` | Resend API key |
| `AUTH_EMAIL_FROM` | Verified sender, e.g. `UseJunction <auth@usejunction.dev>` |

### OAuth (optional)

Enable matching `NEXT_PUBLIC_*_AUTH_ENABLED=true` only when credentials are set:

- GitHub: `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`, `NEXT_PUBLIC_GITHUB_AUTH_ENABLED`
- Google: `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED`
- Microsoft: `AUTH_MICROSOFT_ENTRA_ID_*`, `NEXT_PUBLIC_MICROSOFT_AUTH_ENABLED`

### Billing (optional until Team checkout)

See [saas-billing-lemon.md](./saas-billing-lemon.md):

- `LEMONSQUEEZY_API_KEY`, `LEMONSQUEEZY_STORE_ID`, `LEMONSQUEEZY_VARIANT_ID_TEAM`, `LEMONSQUEEZY_WEBHOOK_SECRET`
- Webhook URL: `https://usejunction.dev/api/webhooks/lemonsqueezy`

### Optional ops / SEO

- `SLACK_WEBHOOK_URL`, `SALES_NOTIFICATION_TO`
- `INDEXNOW_KEY`, `GOOGLE_SITE_VERIFICATION`, `BING_SITE_VERIFICATION`, `NEXT_PUBLIC_TWITTER_HANDLE`
- GitHub App: `GITHUB_APP_ID`, `GITHUB_APP_SLUG`, `GITHUB_APP_PRIVATE_KEY`

After changing env vars, **redeploy** Production so the new values are picked up.

## Cron jobs

| Route | Purpose | Schedule |
|-------|---------|----------|
| `POST /api/cron/usage-daily-refresh` | Seal UTC day for agent full usage rescans + invalidate analytics caches | `15 0 * * *` (Vercel cron in `apps/admin/vercel.json`) |
| `POST /api/cron/materialize-org-day-snapshots` | Materialize org day analytics snapshots | `*/15 * * * *` |
| `POST /api/cron/daily-report-send` | Email daily report teasers at 19:00 in each user’s timezone | `5 * * * *` |

These routes exist but are **not** scheduled by default (no Actions schedule; add Vercel cron or external ping if needed):

| Route | Purpose | When to schedule |
|-------|---------|------------------|
| `POST /api/cron/billing-seat-sync` | Reconcile Lemon Team seat quantities | Every ~5 min if selling Team; roster + webhooks already sync on demand |
| `POST /api/cron/provider-sync` | Sync due provider connections | Only if you rely on automatic provider pulls |
| `POST /api/cron/litellm-budget` | Reset LiteLLM budgets | Only if LiteLLM runs in production |

Authenticate with `Authorization: Bearer $CRON_SECRET`.

The usage daily refresh stores `fullUsageRescanDay` (UTC `YYYY-MM-DD`) in `app_runtime_settings`. Enrolled agents receive that day on heartbeat and run one full 60-day local usage rescan, then return to incremental snapshot syncs.

Daily report emails are **separate** from the usage seal. The hourly `daily-report-send` job selects users whose local clock is 19:00, sends a branded HTML teaser (personal + owner/admin org rollup), and deep-links to `/reports/daily` (React + shadcn charts). Users opt out under Settings → Email reports. Timezone is captured from the browser and agent heartbeat (`User.timeZone`).

**Local dev:** how to trigger the report cron, test the UI without email, and interpret `due` / `skipped` — [daily-reports.md](./daily-reports.md#run-the-report-job-locally).

## Agent OTA (separate from web deploy)

Pushing to `main` does **not** update enrolled devices.

1. Configure GitHub signing + promote secrets — [agent-releases.md § Production secrets setup](./agent-releases.md#production-secrets-setup)
2. Tag `agent-vX.Y.Z` → draft candidate
3. Manually promote via **Agent release control** workflow

Full ship checklist: [agent-releases.md § How to ship a production agent release](./agent-releases.md#how-to-ship-a-production-agent-release).

## First-time go-live checklist

1. [ ] Production Postgres provisioned; pooled Prisma-compatible `DATABASE_URL` set
2. [ ] `prisma migrate deploy` against production
3. [ ] Required Vercel env vars set; Production redeployed
4. [ ] Vercel Function Region is closest to the database; preview `Server-Timing` budgets pass
5. [ ] Sign-up / sign-in / email invite works (Resend)
6. [ ] Domain `https://usejunction.dev` serves the app
7. [ ] (If Team billing) Lemon keys + webhook configured
8. [ ] GitHub `agent-production` env + signing secrets configured
9. [ ] First `agent-v*` candidate built and promoted when ready to OTA

## Related docs

- [Controlled Agent Releases](./agent-releases.md)
- [SaaS billing (Lemon Squeezy)](./saas-billing-lemon.md)
- [SEO / AEO measurement](./seo-aeo-measurement.md)
