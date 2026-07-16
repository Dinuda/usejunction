# Signals Collection

UseJunction Signals is the activity-collection layer that sits on top of the existing AI productivity product. It records AI-adjacent workflow metadata so the dashboard can later answer questions like:

- what apps and domains surround AI usage
- how often teams use AI
- how long those sessions last
- which workflows repeat often enough to automate or govern

Signals is intentionally collection-first. It does not try to be workflow automation, routing, or recommendation logic yet.

## What Is Collected

The v1 data model is session-based and privacy-minimal:

- foreground app
- inferred browser domain when available
- AI tool name
- session start/end time
- session duration
- app/domain before AI
- app/domain after AI
- a derived flow signature
- confidence score
- step list used to reconstruct the session

The implementation explicitly rejects raw content fields such as:

- screenshots
- page content
- prompts
- keystrokes
- clipboard text
- full URLs
- unrestricted window titles

That constraint is enforced at the ingest boundary, not just by convention.

## How It Works

The current implementation uses the existing enrolled desktop agent as the default collector.

The data path is:

1. The admin enables Signals for an organization or team.
2. The agent fetches policy from `/api/devices/signals-policy`.
3. The local collector samples foreground app state on a short interval.
4. The sessionizer groups activity into AI-adjacent sessions.
5. The agent uploads batches to `/api/ingest/signals-sessions`.
6. The admin UI shows team-level summaries.
7. The employee UI shows a personal ledger of what was collected.

The ingest path is separate from the existing `UsageDaily` accounting path. That is deliberate: Signals is about activity flow, not model billing.

## Current Collector Behavior

The collector layer is abstracted in `agent/internal/signals/`.

Platform support today:

- macOS: prototype foreground-window collector with local AppleScript/system-state probing
- Windows: foreground window and idle-time collector using native Windows APIs
- other platforms: no-op collector with a clear unsupported signal

The sessionizer currently does the following:

- samples every 2 seconds
- closes a session when the foreground app changes or the user goes idle
- keeps a short amount of surrounding context
- derives an AI tool name from known domains and app/title hints
- assigns a flow signature like `crm_to_chatgpt_to_chat`
- suppresses excluded apps and domains
- de-duplicates uploads with a local idempotency key

The browser-domain part is best-effort in v1. The code is structured so a future browser extension can provide precise active-tab domains through native messaging without changing the session model.

## Server Surfaces

The implementation exposes these endpoints:

- `GET /api/devices/signals-policy` - device policy fetch
- `POST /api/ingest/signals-sessions` - device batch ingest
- `GET /api/signals/policy` - org policy read
- `PATCH /api/signals/policy` - org policy update
- `GET /api/signals/summary` - admin aggregate summary
- `GET /api/me/signals-ledger` - personal ledger view

The database models are:

- `SignalsPolicy`
- `SignalsSession`
- `SignalsActivityEvent`

`SignalsActivityEvent` is optional and exists mainly for debugging or future deep inspection; the session table is the canonical object.

## Privacy And Trust

Signals is designed to be transparent:

- the admin can see the collection policy
- the employee can see the uploaded ledger
- the repo treats collection as metadata only
- the ingest layer rejects forbidden raw-content fields

The intended privacy posture is:

- app/domain-level activity is acceptable
- raw screen capture is not part of v1
- raw prompt capture is not part of v1
- raw clipboard capture is not part of v1

## Product Intent

Signals is meant to answer a narrow question first:

“Where does AI actually sit in a team’s workday?”

It is not yet trying to decide which model should run, how work should be routed, or how to infer business outcomes from downstream systems. Those are later layers, usually with workplace integrations.

## Relevant Files

- [agent/internal/signals/sessionizer.go](/Users/dinudayaggahavita/Documents/work/usejunciton/agent/internal/signals/sessionizer.go)
- [agent/internal/signals/runner.go](/Users/dinudayaggahavita/Documents/work/usejunciton/agent/internal/signals/runner.go)
- [apps/admin/app/api/ingest/signals-sessions/route.ts](/Users/dinudayaggahavita/Documents/work/usejunciton/apps/admin/app/api/ingest/signals-sessions/route.ts)
- [apps/admin/app/api/signals/policy/route.ts](/Users/dinudayaggahavita/Documents/work/usejunciton/apps/admin/app/api/signals/policy/route.ts)
- [apps/admin/app/(workspace)/activity/page.tsx](/Users/dinudayaggahavita/Documents/work/usejunciton/apps/admin/app/(workspace)/activity/page.tsx)
