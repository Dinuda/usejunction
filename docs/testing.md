# Testing

The admin app uses Vitest for fast unit/component tests and Playwright Chromium for browser workflows.

```sh
pnpm test
pnpm --filter @usejunction/admin test:unit
pnpm --filter @usejunction/admin test:component
pnpm --filter @usejunction/admin test:integration
pnpm test:coverage
```

Component tests use React Testing Library with `happy-dom`. Tests that render React components should include the `happy-dom` environment marker and import `tests/setup/component` so DOM cleanup, `jest-dom`, router-safe browser APIs, and chart observers are installed.

For browser tests, prepare the database with the deterministic fixture and run Chromium:

```sh
pnpm --filter @usejunction/admin e2e:seed
pnpm --filter @usejunction/admin exec playwright install chromium
pnpm test:e2e
```

The seed uses `owner@example.com` / `e2e-password` by default. Override `E2E_OWNER_EMAIL`, `E2E_OWNER_PASSWORD`, `E2E_DEVELOPER_EMAIL`, or `E2E_ORG_SLUG` when needed. Authentication state, reports, traces, screenshots, and videos are ignored by Git.

The existing shell full-stack test remains separate because it validates gateway/API infrastructure. Playwright validates the authenticated workspace pages, route variants, filters, tabs, seeded calculation output, and browser errors.

## Calculation verification (golden / reconciliation)

Separate from unit and browser tests: page query outputs are reconciled against an independent recompute from raw `usage_daily` rows. This is a **correctness verification suite**, not a performance benchmark.

```sh
# Deterministic e2e fixture (Docker DB / root .env)
pnpm --filter @usejunction/admin e2e:seed
pnpm --filter @usejunction/admin verify:calcs

# Real local org + ~/.usejunction agent cache (apps/admin/.env)
pnpm --filter @usejunction/admin verify:calcs:local
```

Full contract, surfaces, views, pass criteria, and triage: [Calculation verification suite](calculation-verification.md). Page/metric map: [Calculation inventory](calculation-inventory.md).

CI runs `verify:calcs` and `tests/calculation-verification.integration.test.ts` in the GitHub Actions `e2e` job after `e2e:seed` (see [calculation-verification.md](calculation-verification.md#ci-github-actions)).

Coverage is reported for the broader billing, metrics, quota, Signals, and period-preference surfaces. The 90% statements/lines/functions and 85% branch gates are applied per file to the calculation modules listed in `apps/admin/vitest.config.ts`; service adapters and broad UI/insight code remain report-only until they have deterministic fixtures.
