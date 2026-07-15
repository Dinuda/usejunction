# Community and commercial editions

This repository contains the self-hosted community control plane, agent,
authentication, ingestion, analytics, insights, integrations, and vendor
subscription cost-accounting features.

The following hosted-business features live in the separate private
[`usejunction-commercial`](https://github.com/Dinuda/usejunction-commercial) repository:

- the `usejunction.dev` marketing website and contact funnel;
- Lemon Squeezy checkout, customer portal, and webhook handling;
- hosted trials, paid-plan entitlements, and device limits;
- upgrade and subscription-management UI;
- additive commercial database fields and migrations.

The community application always creates `community` workspaces and does not
limit enrolled devices. Manual tracking of Cursor, Codex, Claude, and other
vendor subscriptions remains a community observability feature; it is not
UseJunction SaaS billing.

CI runs `pnpm check:community-boundary` to prevent commercial source or
dependencies from being added to this repository.

See `docs/developing.md` for the day-to-day workflow across both repositories.
