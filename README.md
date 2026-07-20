# UseJunction

Open-source observability for AI coding tools. Track usage, cost, latency, plan/seat utilization, and configuration health across Codex, Claude Code, Cursor, Continue, local models, and more.

**Site:** [usejunction.dev](https://usejunction.dev) · **Guides:** [Plan usage & waste](https://usejunction.dev/guides/see-plan-usage-and-waste) · [Team AI coding insights](https://usejunction.dev/guides/see-team-ai-coding-usage) · [llms.txt](https://usejunction.dev/llms.txt)

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
| Postgres (host) | localhost:5433 |

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

Windows 10/11 PowerShell (x64 or ARM64, no administrator shell required):

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "& ([scriptblock]::Create((Invoke-RestMethod -UseBasicParsing 'http://localhost:3001/install.ps1'))) -Token '<token>' -Url 'http://localhost:3001'"
```

Teammate connect (from Team → Share connect command):

```bash
curl -fsSL http://localhost:3001/install.sh | sh -s -- --connect <token> --url http://localhost:3001
# opens browser to authenticate with the invited email, then enrolls
```

The onboarding and invite screens provide a separate Windows PowerShell command. Windows installs run through a per-user Scheduled Task at logon and collect native Windows coding-tool data; WSL stores are not scanned.

Or build manually:

```bash
cd agent && go build -o usejunction .
./usejunction enroll --token <token> --url http://localhost:3001
./usejunction doctor
./usejunction report
```

### Hot-reload the local agent (development)

After the agent is enrolled once, rebuild and reinstall into `~/.usejunction` whenever `agent/` changes:

```bash
# one-shot rebuild + swap + daemon restart
pnpm agent:reinstall
# or: ./scripts/dev-agent-reinstall.sh

# watch agent sources and reinstall on change
pnpm dev:agent
# or: ./scripts/dev-agent-watch.sh
```

Requires an existing `~/.usejunction/config.json` (from `./install.sh --token …`). This path stamps a `0.0.0-dev.<sha>.<unix>` version, swaps the local binary/app bundle, and restarts launchd/systemd. It does **not** publish a control-plane release or enroll a new device.

For faster change detection, install `fswatch` (`brew install fswatch`). Without it, the watcher polls every ~750ms.

## Architecture

```
Coding tools → LiteLLM Proxy → Providers
                    ↓
              Langfuse (traces)
                    ↓
         UseJunction callback → Admin API → Postgres
                    ↑
         Go agent (heartbeat, tool detection, local log scans)
                    ↑
  Provider Admin APIs + Claude Code OTLP/HTTP JSON
```

Analytical reads are centralized through `UsageDaily`, the SQL query engine, and a PostgreSQL result cache. See [Central Analytics Engine](docs/central-analytics-engine.md), [Usage Accounting Contract](docs/usage-accounting.md), and [Subscription Cycle Utilization](docs/subscription-cycle-utilization.md).

Signals collection is documented in [docs/signals-collection.md](docs/signals-collection.md). It covers the optional activity-flow layer that collects AI-adjacent app/domain sessions from the enrolled desktop agent.

## CLI commands

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

Agent release operations, triggers, rollout behavior, and fleet coverage are documented in [Controlled Agent Releases](docs/agent-releases.md).

### Release development

When you are changing the release system itself, this is the fastest local loop:

```bash
cd agent && go test ./...
pnpm test
./scripts/build-agent-releases.sh 0.2.0
```

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
