# UseJunction

AI coding spend management for engineering teams. UseJunction tracks usage, cost, latency, plan utilization, seat waste, and configuration health across Codex, Claude Code, Cursor, GitHub Copilot, local models, and more.

**Site:** [usejunction.dev](https://usejunction.dev) · **Solutions:** [AI coding spend management](https://usejunction.dev/solutions/ai-coding-spend-management) · [Seat utilization](https://usejunction.dev/solutions/ai-coding-seat-utilization) · [Plan usage](https://usejunction.dev/solutions/ai-coding-plan-usage) · **Guides:** [Plan usage & waste](https://usejunction.dev/guides/see-plan-usage-and-waste) · [Team AI coding insights](https://usejunction.dev/guides/see-team-ai-coding-usage) · [llms.txt](https://usejunction.dev/llms.txt)

## AI coding spend management for teams

Engineering and platform teams use UseJunction to answer four operational questions:

- Which AI coding tools and models are developers actually using?
- What is the estimated cost by developer, team, tool, and model?
- Which paid seats are idle, underused, or approaching plan limits?
- Which devices are missing coverage or using personal keys?

UseJunction is open source and self-hostable under the UseJunction Community License. It provides visibility across Cursor, Claude Code, Codex, GitHub Copilot, Continue, Cline, Roo Code, OpenCode, Ollama, LM Studio, and related runtimes without keystroke surveillance, browser capture, or full network interception. Start with the [team AI spend solutions](https://usejunction.dev/solutions), then read the [WakaTime comparison](https://usejunction.dev/compare/wakatime) if you are evaluating editor-time tracking versus AI tool observability.

<!-- Architecture diagram: add PNG/SVG at docs/images/architecture.png -->
![UseJunction architecture](docs/images/readme-image.png)

## Project status

UseJunction is currently maintained by a single independent developer. The project is open for evaluation, feedback, and self-hosted use today, with a fuller community contribution setup coming soon.

## Tested & verified coverage

UseJunction separates **verified usage** (vendor-reported charges when billable, e.g. Cursor `chargedCents > 0`) from **estimated usage** (local scans and rate-card pricing — including Cursor included/plan usage when `chargedCents = 0`). The combinations below have been tested on real machines and confirmed to surface usage correctly in the admin UI.

| Tool | Platform | Verified usage |
|------|----------|----------------|
| Cursor | macOS | ✓ |
| Codex | macOS | ✓ |
| Cursor | Windows | ✓ |

Other tools and platforms are supported by the agent collector; this table will grow as additional stacks are validated end-to-end.

## Quick start

### Full Docker

Run the entire stack in Docker — admin on **:3001** (host; configurable via `ADMIN_HOST_PORT`), Langfuse on **:3000**, LiteLLM on **:4000**.

```bash
cp .env.example .env
# Optional: add provider keys to test real LiteLLM completions
#   OPENAI_API_KEY=sk-...
#   ANTHROPIC_API_KEY=sk-ant-...
# Without keys, full-stack E2E still passes by verifying the ingest API directly.

cd infra
docker compose build admin
docker compose up -d
docker compose ps   # wait until all services are healthy
```

If port 3001 is taken:

```bash
ADMIN_HOST_PORT=3020 docker compose up -d
ADMIN_URL=http://localhost:3020 ./run-e2e.sh
```

**Langfuse project keys (one-time, for traces):**

1. Open http://localhost:3000 → create account → create project
2. Copy **Public Key** and **Secret Key** into root `.env`
3. Restart LiteLLM: `cd infra && docker compose restart litellm`

The admin container runs `prisma db push` and seeds `seed-org` plus a demo enrollment token on first start.

**Verify end-to-end:**

```bash
chmod +x scripts/full-stack-e2e.sh
./scripts/full-stack-e2e.sh

# or from infra/
./run-e2e.sh
```

Manual gateway request (use a user id from **Developers**):

```bash
curl http://localhost:4000/v1/chat/completions \
  -H "Authorization: Bearer sk-usejunction-master" \
  -H "Content-Type: application/json" \
  -H "x-usejunction-user: <userId>" \
  -H "x-usejunction-tool: codex" \
  -d '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"ping"}]}'
```

| Service | URL |
|---------|-----|
| Admin UI | http://localhost:3001 (`admin@example.com` / `admin`) |
| Langfuse | http://localhost:3000 |
| LiteLLM | http://localhost:4000 |
| Postgres (host) | localhost:5432 |

### Hybrid local dev

```bash
cp .env.example .env
cd infra
docker compose up -d postgres langfuse-db litellm-db langfuse litellm
# Wait for DBs, then start admin locally:
cd ..
pnpm install
pnpm db:push
pnpm db:seed
pnpm dev
```

Admin UI: http://localhost:3001  
Generate a developer-bound enrollment token after signing in and joining the organization:

```bash
curl -X POST http://localhost:3001/api/me/enrollment-token \
  -H "Cookie: uj_session=..." | jq
```

### Install the local agent

From a repo checkout (builds the Go agent locally — preferred for development):

```bash
chmod +x install.sh
./install.sh --token <token> --url http://localhost:3001
# enrolls, enables Claude OTEL, sends first report, and starts the daemon
```

One-liner (downloads a prebuilt binary from the control plane, or builds from source if the repo is on disk):

```bash
# optional for pnpm/dev without Docker: publish binaries into apps/admin/public
./scripts/build-agent-releases.sh 0.2.0

curl -fsSL http://localhost:3001/install.sh | sh -s -- --token <token> --url http://localhost:3001
```

The installer adds `~/.usejunction/bin` to your shell `PATH`. Open a new terminal (or run `export PATH="$HOME/.usejunction/bin:$PATH"`) before using `usejunction` commands.

Windows 10/11 PowerShell (x64 or ARM64, no administrator shell required):

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "& ([scriptblock]::Create((Invoke-RestMethod -UseBasicParsing 'http://localhost:3001/install.ps1'))) -Token '<token>' -Url 'http://localhost:3001'"
```

The Windows installer adds `%USERPROFILE%\.usejunction\bin` to your user `PATH`. Open a new terminal before using `usejunction` commands.

Teammate connect uses the shared team invite link (`/i/<token>`). After signing in there, the UI shows the install command with an enrollment `--token`.

The onboarding and invite screens provide a separate Windows PowerShell command. Windows installs run through a per-user Scheduled Task at logon and collect native Windows coding-tool data; WSL stores are not scanned.

Or build manually:

```bash
cd agent && go build -o usejunction .
./usejunction enroll --token <token> --url http://localhost:3001
./usejunction doctor
./usejunction report
```

### Two agents on one Mac (production + local dev)

UseJunction supports running **production** and **local dev** agents side by side:

| Profile | Home | CLI | launchd label | Local sync port |
|---------|------|-----|---------------|-----------------|
| Production (default) | `~/.usejunction` | `usejunction` | `com.usejunction.agent` | `47832` |
| Test (local dev) | `~/.usejunction-test` | `usejunction-test` | `com.usejunction.agent.test` | `47833` |

- Enroll **production** from your hosted control plane (e.g. `https://usejunction.dev`).
- Enroll **local dev** from `http://localhost:3001` — the installer auto-selects the test profile for loopback URLs.

Both daemons can run at the same time without clobbering each other's enrollment.

### Hot-reload the local agent (development)

After the test agent is enrolled once, rebuild and reinstall into `~/.usejunction-test` whenever `agent/` changes:

```bash
# admin + agent watcher (rebuilds agent on start and on agent/ changes)
pnpm dev
# or: ./scripts/dev-start.sh

# admin only (no agent rebuild/watch)
pnpm dev:admin

# one-shot rebuild + swap + daemon restart
pnpm agent:reinstall
# or: ./scripts/dev-agent-reinstall.sh

# watch agent sources and reinstall on change
pnpm dev:agent
# or: ./scripts/dev-agent-watch.sh
```

Requires an existing `~/.usejunction-test/config.json` (from `./install.sh --token … --url http://localhost:3001` or the connect curl). This path stamps a `0.0.0-dev.<sha>.<unix>` version, swaps the local binary/app bundle, and restarts launchd/systemd. It does **not** publish a control-plane release or enroll a new device.

Set `USEJUNCTION_PROFILE=default` to rebuild the production agent home (`~/.usejunction`) instead.

When you enroll against a **local** control plane (`http://localhost:3001`), `/install.sh` injects `USEJUNCTION_ROOT` and `USEJUNCTION_PROFILE=test` so `curl | sh` builds the agent from this checkout as `0.0.0-dev.*` into `~/.usejunction-test` instead of downloading a published release or touching production enrollment. Production hosts still serve the plain customer installer (published releases only).

**Install gotchas:** A prior `pnpm agent:reinstall` writes `~/.usejunction-test/dev-source`, so later `curl | sh` against prod may still build `0.0.0-dev.*` if a dev pin exists under the target profile home. Production customer installs also require a **promoted** release (`GET /api/agent-releases/latest` must return 200); a GitHub `agent-v*` tag alone is not enough. See [Install script behavior (prod vs dev)](docs/agent-releases.md#install-script-behavior-prod-vs-dev).

For faster change detection, install `fswatch` (`brew install fswatch`). Without it, the watcher polls every ~750ms.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Developer machines                                                     │
│                                                                         │
│  Codex / Claude / Cursor / Copilot / OpenCode / Antigravity / …         │
│       │                                                                 │
│       ▼                                                                 │
│  Go agent (profile-isolated: ~/.usejunction or ~/.usejunction-test)     │
│    • heartbeat (15m) + OTA update directives                            │
│    • local scans (JSONL / sqlite) → estimated_api                       │
│    • Cursor usage events (chargedCents) → verified_usage                │
│      or rate-card estimated_api when included usage is $0               │
│    • quotas, accounts, tools inventory                                  │
│    • optional Signals / work extraction                                 │
│    • localhost sync endpoint (47832 default / 47833 test)               │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │ UUS sync (start → chunk → commit)
                                │ OTEL metrics (Claude)
                                │ heartbeats / agent-update events
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Control plane (apps/admin · Next.js)                                   │
│                                                                         │
│  Ingest → UsageDaily (+ inventory / quotas)                             │
│  Source priority: vendor_verified > otel > device_observed > estimated  │
│  Cost kinds: actual_spend · verified_usage · estimated_api              │
│                                                                         │
│  Org-day snapshots → dashboard KPIs / tool detail / Models tables       │
│  Sync team = wake agents to upload (does not install agent binaries)    │
│  Agent OTA = tag agent-v* → promote → heartbeat directive               │
│    normal = 24h staggered · critical = immediate                        │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │
                                ▼
                         PostgreSQL
```

Optional gateway path (self-hosted Docker / LiteLLM) still exists for traced proxy traffic:

```
Coding tools → LiteLLM → Providers
                  ↓
            Langfuse traces
                  ↓
       UseJunction callback → Admin API
```

**Cost semantics (short):** dashboard Estimated Usage = `verified_usage + estimated_api`. Cursor plan/bonus rows with `chargedCents = 0` are estimated from the rate card after agent rematerialize — they are not labeled verified at $0. See [Usage Accounting](docs/usage-accounting.md).

**Reads:** analytical queries go through `UsageDaily`, the SQL query engine, and org-day snapshots. See [Central Analytics Engine](docs/central-analytics-engine.md) and [Subscription Cycle Utilization](docs/subscription-cycle-utilization.md).

**Sync paths:** device local sync, vendor admin APIs, Claude OTEL, and invoice import — overview in [Tool Sync Methodology](docs/tool-sync-methodology.md).

**Agent OTA / dual profiles:** [Controlled Agent Releases](docs/agent-releases.md). Signals: [docs/signals-collection.md](docs/signals-collection.md).

## CLI commands

After install, `usejunction` is on your `PATH` in new terminals (`~/.usejunction/bin` on macOS/Linux, `%USERPROFILE%\.usejunction\bin` on Windows). You can also run the binary directly if needed.

| Command | Description |
|---------|-------------|
| `usejunction enroll --token <t>` | Enroll device (runs setup by default) |
| `usejunction setup` | Enable Claude OTEL and send initial report |
| `usejunction doctor` | Detect installed tools |
| `usejunction status` | Show enrollment state |
| `usejunction cost --tool all` | Local usage scan (JSONL / sqlite / extension task JSON) |
| `usejunction update --check` | Check the active release without installing |
| `usejunction update` | Download, verify, and install an available update |
| `usejunction update --rollback` | Restore the retained previous binary |
| `usejunction update --force` | Reinstall a version locally blocked after rollback |
| `usejunction uninstall` | Remove agent |

Existing `0.1.0` installations need one final updater bootstrap after the first release is promoted:

```bash
curl -fsSL <control-plane>/install.sh | sh -s -- --upgrade --url <control-plane>
```

Hosted production (Vercel, env vars, migrations, crons) is documented in [Production deployment](docs/production-deployment.md).

Agent release operations, triggers, rollout behavior, and fleet coverage are documented in [Controlled Agent Releases](docs/agent-releases.md).

### Release development

When you are changing the release system itself, this is the fastest local loop:

```bash
cd agent && go test ./...
pnpm test
./scripts/build-agent-releases.sh 0.2.0
```

For the full admin CI suite (type-check, coverage, integration, prod build, E2E), run `pnpm verify:e2e` — see [Testing](docs/testing.md#run-the-full-ci-suite-locally).

Then exercise the rollout path against a local or staging control plane:

```bash
git tag agent-v0.2.0
git push origin agent-v0.2.0
```

The protected promotion workflow and the control-plane endpoints are described in [docs/agent-releases.md](docs/agent-releases.md).

## Project structure

```
infra/          Docker Compose (Postgres, LiteLLM, Langfuse)
apps/admin/     Next.js admin UI + control plane API
packages/db/    Prisma schema + client
agent/          Go local agent CLI
install.sh      One-line enroll installer
scripts/        Full-stack E2E
```

## Privacy

Privacy first. Observability second. Local scans read usage signals from tool-local storage (JSONL sessions, sqlite DBs, extension task JSON). There is no keystroke surveillance, browser capture, or network interception.

Signals can add optional work context (including allowlisted clipped summaries when enabled). That detail can be turned off. It does not collect screenshots, raw chat transcripts, clipboard text, or full URLs, and the employee ledger shows exactly what was uploaded.

## License

[UseJunction Community License](LICENSE) — based on [Apache 2.0](http://www.apache.org/licenses/LICENSE-2.0) with additional terms:

- **Use as-is commercially** — run the unmodified software (frontend, backend, or self-hosted) in a commercial context.
- **Derivatives require a license** — developing or distributing a modified fork for commercial use requires a separate license. Contact [hello@usejunction.dev](mailto:hello@usejunction.dev).
