# Daily & weekly reports

Product-native usage reports: in-app React pages with shadcn Area charts, plus Resend email teasers in each user’s IANA timezone.

## In-app reports

Sent emails appear on **Activity** → **Reports** (below device activity). The section lists the latest five; **View all** opens a dialog with filters and the exact HTML sent to the inbox.

| Audience | Content |
|----------|---------|
| **You** | Your daily personal digests |
| **Team** (owners/admins) | Weekly team digests |

Legacy `/reports/daily` URLs redirect to `/activity#reports`.

## Email teasers

| Kind | Who | Cadence | Numbers |
|------|-----|---------|---------|
| **You** (personal) | Every member with a linked developer (default on) | **Daily** at 19:00 local | That local day |
| **Team** (org) | Owners/admins (default on) | **Weekly** Sundays at 19:00 local | Mon–Sun week vs prior week |

- **Opt-out:** Settings → Email reports (`dailyPersonalEnabled` / `dailyOrgEnabled`)
- **Timezone:** browser on login (`TimezoneReporter`) or agent heartbeat IANA; manual override in Settings locks auto-updates

Emails link to the in-app report (`period=week` for team). Charts live in the product UI only (email clients cannot run Recharts).

## Production cron

Hobby Vercel cannot run hourly crons, so report send is triggered from GitHub Actions.

| Route | Schedule | Scheduler | Role |
|-------|----------|-----------|------|
| `POST /api/cron/daily-report-send` | `5 * * * *` (hourly at :05) | GitHub Actions (`production-crons.yml`) | Personal at local 19:00; team weekly on Sunday 19:00 |
| `GET/POST /api/cron/usage-daily-refresh` | `15 0 * * *` | Vercel (`vercel.json`) | UTC day seal + agent full rescan (separate job) |

Auth: `Authorization: Bearer $CRON_SECRET`

See [production-deployment.md](./production-deployment.md#cron-jobs) for `agent-production` secrets (`CRON_SECRET`, `CONTROL_PLANE_URL`) and the Hobby/Actions split.

## Run the report job locally

### 1. Prerequisites

- Admin app running (`pnpm --filter @usejunction/admin dev`, often `http://localhost:3001`)
- `DATABASE_URL` set; migrations applied (`pnpm --filter @usejunction/db exec prisma migrate deploy`)
- For real email: `RESEND_API_KEY` (and optionally `REPORTS_EMAIL_FROM`, e.g. `UseJunction <reporting@usejunction.dev>`) in `apps/admin/.env`
- User has `time_zone` set (visit the app once, or Settings → Email reports)
- Daily report prefs enabled (default on)
- Linked developer row for personal reports; owner/admin for workspace report

Without `RESEND_API_KEY`, the server logs the email to the console instead of sending via Resend.

### 2. Trigger the cron

In development, if `CRON_SECRET` is unset, the default bearer token is `development-cron`:

```bash
curl -sS -X POST "http://localhost:3001/api/cron/daily-report-send" \
  -H "Authorization: Bearer development-cron" \
  -H "Content-Type: application/json"
```

**Local testing without waiting for 19:00** (non-production only):

```bash
curl -sS -X POST "http://localhost:3001/api/cron/daily-report-send?force=1" \
  -H "Authorization: Bearer development-cron"
```

Send again even if already delivered today:

```bash
curl -sS -X POST "http://localhost:3001/api/cron/daily-report-send?force=1&resend=1" \
  -H "Authorization: Bearer development-cron"
```

`force` and `resend` are ignored in production.

If you set `CRON_SECRET` in `.env`, use that value instead.

Example response:

```json
{
  "ok": true,
  "scanned": 3,
  "due": 1,
  "sent": 2,
  "skipped": 0,
  "failed": 0
}
```

| Field | Meaning |
|-------|---------|
| `scanned` | Organization memberships checked |
| `due` | Users whose local clock is in the 19:00 hour |
| `sent` | Emails sent successfully (personal and org count separately) |
| `skipped` | Already delivered for that `(user, org, kind, localDate)` |
| `failed` | Send or build errors |

### 3. Why `due: 0` is common

The job only sends when the user’s `time_zone` (fallback `UTC`) has **local hour === 19**. Outside that window you get `due: 0` and no emails.

**Local testing options:**

1. **Wait until 19:00** in your configured timezone, or set timezone in Settings to a zone where it is currently 19:00.
2. **Test the report UI without email** — open `/reports/daily` or `/reports/daily/workspace` while signed in.
3. **Re-send after a successful run** — clear idempotency for today:

   ```sql
   DELETE FROM daily_report_deliveries WHERE local_date = 'YYYY-MM-DD';
   ```

### 4. Related cron (usage seal, not email)

Agent full-rescan signaling (UTC midnight seal):

```bash
curl -sS -X POST "http://localhost:3001/api/cron/usage-daily-refresh" \
  -H "Authorization: Bearer development-cron"
```

This does **not** send daily report emails.

## Automated tests

```sh
pnpm --filter @usejunction/admin exec vitest run \
  tests/timezone.test.ts \
  tests/timezone-preferences.test.ts \
  tests/daily-report-email.test.ts \
  tests/daily-report-send-cron.test.ts
```

## Key code paths

| Area | Path |
|------|------|
| Report payload | `apps/admin/lib/reports/daily-report.ts` |
| Send fan-out | `apps/admin/lib/reports/daily-report-send.ts` |
| Cron route | `apps/admin/app/api/cron/daily-report-send/route.ts` |
| Email HTML | `apps/admin/lib/email/daily-report.ts` |
| Timezone helpers | `apps/admin/lib/timezone.ts` |
| UI | `apps/admin/components/reports/daily/` |
| Agent TZ on heartbeat | `agent/internal/platformdirs/timezone.go` |
