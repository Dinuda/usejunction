# UseJunction

Community-licensed, self-hosted observability for AI coding tools. Track usage, cost, latency, and configuration health across Codex, Claude Code, Cursor, Continue, local models, and more.

## Quick start

### Full Docker (recommended)

Run the entire stack in Docker — admin on **:3001** (host; configurable via `ADMIN_HOST_PORT`), Langfuse on **:3000**, LiteLLM on **:4000**.

```bash
cp .env.example .env
# Fill every blank secret. Generate values with:
#   openssl rand -hex 32
# Generate INTEGRATION_ENCRYPTION_KEY with:
#   openssl rand -base64 32
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

The admin container applies committed Prisma migrations and refuses known
default secrets or demo seeding. Create the first account through `/signup`.
For the first boot, set `INGEST_ORG_ID=pending-setup`. After creating the
workspace, replace it with the organization ID and restart `admin` and
`litellm`; the ingest credential is intentionally bound to that one tenant.

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
  -H "Authorization: Bearer $LITELLM_MASTER_KEY" \
  -H "Content-Type: application/json" \
  -H "x-usejunction-user: <userId>" \
  -H "x-usejunction-tool: codex" \
  -d '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"ping"}]}'
```

| Service | URL |
|---------|-----|
| Admin UI | http://localhost:3001 (register the first owner) |
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
# enrolls, configures tools, enables Claude OTEL, sends first report, and starts the daemon
```

One-liner (downloads a prebuilt binary from the control plane, or builds from source if the repo is on disk):

```bash
# optional for pnpm/dev without Docker: publish binaries into apps/admin/public
./scripts/build-agent-releases.sh

curl -fsSL http://localhost:3001/install.sh | sh -s -- --token <token> --url http://localhost:3001
```

Teammate connect (from Team → Share connect command):

```bash
curl -fsSL http://localhost:3001/install.sh | sh -s -- --connect <token> --url http://localhost:3001
# opens browser to authenticate with the invited email, then enrolls
```

Or build manually:

```bash
cd agent && go build -o usejunction .
./usejunction enroll --token <token> --url http://localhost:3001
./usejunction doctor
./usejunction report
```

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

## CLI commands

| Command | Description |
|---------|-------------|
| `usejunction enroll --token <t>` | Enroll device (runs setup by default) |
| `usejunction setup` | Configure gateway, Claude OTEL, and send initial report |
| `usejunction doctor` | Detect installed tools |
| `usejunction configure` | Point supported tools at the org gateway |
| `usejunction unconfigure` | Restore config backups |
| `usejunction status` | Show enrollment state |
| `usejunction cost --tool all` | Local JSONL usage scan |
| `usejunction uninstall` | Remove agent |

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

Metadata-only logging by default. Local scans read token counts from session JSONL files — never prompts or responses.

## License

[UseJunction Community License](LICENSE) — based on [Apache 2.0](http://www.apache.org/licenses/LICENSE-2.0) with additional terms:

- **Use as-is commercially** — run the unmodified software (frontend, backend, or self-hosted) in a commercial context.
- **Derivatives require a license** — developing or distributing a modified fork for commercial use requires a separate license. Contact [hello@usejunction.dev](mailto:hello@usejunction.dev).
