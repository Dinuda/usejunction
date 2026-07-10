# UseJunction

Open-source observability for AI coding tools. Track usage, cost, latency, and configuration health across Codex, Claude Code, Cursor, Continue, local models, and more.

## Quick start

### Full Docker (recommended)

Run the entire stack in Docker — admin on **:3011** (host; configurable via `ADMIN_HOST_PORT`), Langfuse on **:3000**, LiteLLM on **:4000**.

```bash
cp .env.example .env
# Step A (optional): add provider keys to test real LiteLLM completions
#   OPENAI_API_KEY=sk-...
#   ANTHROPIC_API_KEY=sk-ant-...
# Without keys, full-stack E2E still passes by verifying the ingest API directly.
#   INGEST_SECRET=change-me-ingest-secret

cd infra
docker compose build admin
docker compose up -d
docker compose ps   # wait until all services are healthy
```

If port 3011 is taken, pick another host port:

```bash
ADMIN_HOST_PORT=3020 docker compose up -d
ADMIN_URL=http://localhost:3020 ./run-e2e.sh
```

**Step B — Langfuse project keys (one-time):**

1. Open http://localhost:3000 → create account → create project
2. Copy **Public Key** and **Secret Key** into root `.env`:
   ```
   LANGFUSE_PUBLIC_KEY=pk-lf-...
   LANGFUSE_SECRET_KEY=sk-lf-...
   ```
3. Restart LiteLLM: `cd infra && docker compose restart litellm`

The admin container runs `prisma db push` and seeds `seed-org` + a demo enrollment token on first start.

**Verify end-to-end** (from repo root or `infra/`):

```bash
# from repo root
chmod +x scripts/full-stack-e2e.sh
./scripts/full-stack-e2e.sh

# or from infra/ (uses ADMIN_HOST_PORT, default 3011)
chmod +x run-e2e.sh
./run-e2e.sh
```

Or send a manual gateway request (use a user id from **Developers** page):

```bash
curl http://localhost:4000/v1/chat/completions \
  -H "Authorization: Bearer sk-usejunction-master" \
  -H "Content-Type: application/json" \
  -H "x-usejunction-user: <userId>" \
  -H "x-usejunction-tool: codex" \
  -d '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"ping"}]}'
```

Check http://localhost:3011/requests for the row and http://localhost:3000 for the Langfuse trace.

| Service | URL |
|---------|-----|
| Admin UI | http://localhost:3011 (`admin@example.com` / `admin`) |
| Langfuse | http://localhost:3000 |
| LiteLLM | http://localhost:4000 |
| Postgres (host) | localhost:5433 |

### Hybrid local dev

### 1. Start infrastructure

```bash
cp .env.example .env
# Optional: OPENAI_API_KEY and/or ANTHROPIC_API_KEY for real gateway completions

cd infra
docker compose up -d postgres langfuse-db litellm-db
# Wait for DBs, then:
docker compose up -d
```

### 2. Set up the admin app (local dev)

```bash
pnpm install
cp .env.example .env
pnpm db:push
pnpm db:seed
pnpm dev
```

Admin UI: http://localhost:3002 (dev) or http://localhost:3001 (Docker)  
Langfuse: http://localhost:3000  
LiteLLM gateway: http://localhost:4000

### 3. Generate enrollment token

```bash
curl -X POST http://localhost:3001/api/enrollment-tokens | jq
```

### 4. Install the local agent

```bash
chmod +x install.sh
./install.sh --enroll-token <token-from-step-3>
```

Or:

```bash
cd agent && go build -o usejunction .
./usejunction enroll --token <token>
./usejunction doctor
./usejunction configure
./usejunction report
```

### 5. Send a test request through the gateway

```bash
curl http://localhost:4000/v1/chat/completions \
  -H "Authorization: Bearer sk-usejunction-master" \
  -H "Content-Type: application/json" \
  -H "x-usejunction-user: seed-user" \
  -H "x-usejunction-tool: curl" \
  -d '{
    "model": "gpt-4o-mini",
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

Check the **Requests** page in the admin UI.

### 6. Local cost scan (bypass detection)

```bash
./agent/usejunction cost --tool codex
./agent/usejunction cost --tool claude --format json
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
```

## CLI commands

| Command | Description |
|---------|-------------|
| `usejunction enroll --token <t>` | Enroll device |
| `usejunction doctor` | Detect installed tools |
| `usejunction configure` | Point tools at org gateway |
| `usejunction status` | Show enrollment state |
| `usejunction probe --tool codex` | Quota + account probe |
| `usejunction cost --tool all` | Local JSONL usage scan |
| `usejunction unconfigure` | Restore config backups |
| `usejunction uninstall` | Remove agent |

## Project structure

```
infra/          Docker Compose (Postgres, LiteLLM, Langfuse)
apps/admin/     Next.js admin UI + control plane API
packages/db/    Prisma schema + client
agent/          Go local agent CLI
install.sh      One-line enroll installer
```

## Privacy

Metadata-only logging by default. Local scans read token counts from session JSONL files — never prompts or responses.

## License

MIT
