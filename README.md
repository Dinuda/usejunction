# UseJunction

Open-source observability for AI coding tools. Track usage, cost, latency, and configuration health across Codex, Claude Code, Cursor, Continue, local models, and more.

## Quick start

### 1. Start infrastructure

```bash
cp .env.example .env
# Add OPENAI_API_KEY and/or ANTHROPIC_API_KEY to .env

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
