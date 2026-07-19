"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, KeyRound, Loader2, Pencil, Plus, RefreshCw, WalletCards } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Panel } from "@/components/panel";
import { SignalsKpi, SignalsSectionHeader } from "@/components/signals/signals-ui";
import { formatCompactNumber, formatDateTime, formatMicrosAsCurrency, formatShortDate } from "@/lib/format";
import { ToolLogoTile } from "./tool-brand-icon";

type Provider = "openai" | "anthropic";
type Pool = {
  id: string; connectionId: string; provider: Provider; name: string; mode: "recurring" | "fixed"; currency: string;
  budgetMicros: string; billingCadence: string | null; billingCycleAnchorDate: string | null; billingCycleDays: number | null;
  grantStartDate: string | null; expiresAt: string | null; period: { start: string; end: string };
  verifiedSpentMicros: string | null; pendingEstimatedMicros: string; projectedSpentMicros: string;
  verifiedRemainingMicros: string | null; projectedRemainingMicros: string; rawRatio: number; displayRatio: number;
  projectedExhaustionAt: string | null; spendDays: number;
  connection: { status: string; lastSyncedAt: string | null; lastCostSyncedAt: string | null; costDataThrough: string | null; costAccessAvailable: boolean; degraded: boolean };
};
type Connection = { id: string; provider: Provider; product: string; status: string };
type Breakdown = {
  verifiedAvailable: boolean;
  rows: Array<{ key: string; label: string; developerId: string | null; externalApiKeyId: string | null; requests: number; tokens: string; allocatedVerifiedMicros: string; pendingEstimatedMicros: string; estimatedMicros: string }>;
  keys: Array<{ id: string; externalKeyId: string; name: string | null; developerId: string | null; mappingSource: string | null; status: string }>;
  developers: Array<{ id: string; name: string; email: string }>;
};

const today = () => new Date().toISOString().slice(0, 10);
const dollarsToMicros = (value: string) => String(Math.round(Number(value || 0) * 1_000_000));

function providerLabel(provider: Provider) {
  return provider === "openai" ? "OpenAI" : "Anthropic";
}

function PoolSheet({ open, onOpenChange, connections, editing, onSaved }: {
  open: boolean; onOpenChange: (open: boolean) => void; connections: Connection[]; editing: Pool | null; onSaved: () => Promise<void>;
}) {
  const [provider, setProvider] = useState<Provider>("openai");
  const [credential, setCredential] = useState("");
  const [budget, setBudget] = useState("");
  const [mode, setMode] = useState<"recurring" | "fixed">("recurring");
  const [cadence, setCadence] = useState("monthly");
  const [anchor, setAnchor] = useState(today());
  const [cycleDays, setCycleDays] = useState("30");
  const [grantStart, setGrantStart] = useState(today());
  const [expiresAt, setExpiresAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setProvider(editing?.provider ?? "openai");
    setBudget(editing ? String(Number(BigInt(editing.budgetMicros)) / 1_000_000) : "");
    setMode(editing?.mode ?? "recurring");
    setCadence(editing?.billingCadence ?? "monthly");
    setAnchor(editing?.billingCycleAnchorDate ?? today());
    setCycleDays(String(editing?.billingCycleDays ?? 30));
    setGrantStart(editing?.grantStartDate ?? today());
    setExpiresAt(editing?.expiresAt ?? "");
    setCredential("");
    setError(null);
  }, [open, editing]);

  async function save() {
    if (!budget || Number(budget) <= 0) return setError("Enter a positive USD credit budget.");
    setSaving(true);
    setError(null);
    let response: Response;
    if (editing) {
      if (credential) {
        const rotate = await fetch(`/api/integrations/${editing.connectionId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ credential }) });
        const rotateBody = await rotate.json().catch(() => ({}));
        if (!rotate.ok) { setSaving(false); return setError(rotateBody.error ?? "Could not rotate provider credential"); }
      }
      response = await fetch(`/api/tools/api-credit-pools/${editing.id}`, {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ budgetMicros: dollarsToMicros(budget), ...(mode === "recurring" ? { billingCadence: cadence, billingCycleAnchorDate: anchor, billingCycleDays: cadence === "custom" ? Number(cycleDays) : null } : { grantStartDate: grantStart, expiresAt: expiresAt || null }) }),
      });
    } else {
      let connection = connections.find((item) => item.provider === provider && item.product === "api_platform" && item.status !== "disconnected");
      if (!connection) {
        if (!credential) { setSaving(false); return setError(`Enter an ${providerLabel(provider)} admin API key.`); }
        const connect = await fetch("/api/integrations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider, product: "api_platform", method: "admin_api_key", credential, config: {} }) });
        const body = await connect.json().catch(() => ({}));
        if (!connect.ok) { setSaving(false); return setError(body.error ?? "Could not connect provider"); }
        connection = body.connection;
      }
      response = await fetch("/api/tools/api-credit-pools", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
        connectionId: connection!.id, mode, budgetMicros: dollarsToMicros(budget),
        ...(mode === "recurring" ? { billingCadence: cadence, billingCycleAnchorDate: anchor, billingCycleDays: cadence === "custom" ? Number(cycleDays) : null } : { grantStartDate: grantStart, expiresAt: expiresAt || null }),
      }) });
      if (response.ok) void fetch(`/api/integrations/${connection!.id}/sync`, { method: "POST" });
    }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { setError(body.error ?? "Could not save API credits"); setSaving(false); return; }
    await onSaved();
    onOpenChange(false);
    setSaving(false);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader className="border-b px-6 py-5">
          <SheetTitle>{editing ? `Edit ${providerLabel(editing.provider)} credits` : "Add API credits"}</SheetTitle>
          <SheetDescription>Track a Junction budget against provider-verified API spend.</SheetDescription>
        </SheetHeader>
        <div className="space-y-5 px-6 py-5">
          {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
          {!editing ? <div className="space-y-2"><Label>Provider</Label><Select value={provider} onValueChange={(value) => setProvider(value as Provider)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="openai">OpenAI API</SelectItem><SelectItem value="anthropic">Anthropic API</SelectItem></SelectContent></Select></div> : null}
          {!editing && !connections.some((item) => item.provider === provider && item.product === "api_platform" && item.status !== "disconnected") ? <div className="space-y-2"><Label htmlFor="credit-key">Admin API key</Label><Input id="credit-key" type="password" autoComplete="off" value={credential} onChange={(event) => setCredential(event.target.value)} placeholder={provider === "openai" ? "sk-admin-…" : "sk-ant-admin…"}/><p className="text-xs text-muted-foreground">Encrypted at rest and never returned to the browser.</p></div> : null}
          {editing ? <div className="space-y-2"><Label htmlFor="rotate-credit-key">Replace admin API key (optional)</Label><Input id="rotate-credit-key" type="password" autoComplete="off" value={credential} onChange={(event) => setCredential(event.target.value)} placeholder={editing.provider === "openai" ? "sk-admin-…" : "sk-ant-admin…"}/></div> : null}
          <div className="space-y-2"><Label htmlFor="credit-budget">Credits / budget (USD)</Label><Input id="credit-budget" type="number" min="0.01" step="0.01" value={budget} onChange={(event) => setBudget(event.target.value)} placeholder="500.00" /></div>
          {!editing ? <div className="space-y-2"><Label>Pool type</Label><Select value={mode} onValueChange={(value) => setMode(value as typeof mode)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="recurring">Recurring budget</SelectItem><SelectItem value="fixed">Fixed credit grant</SelectItem></SelectContent></Select></div> : null}
          {mode === "recurring" ? <>
            <div className="space-y-2"><Label>Cadence</Label><Select value={cadence} onValueChange={setCadence}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{["weekly", "monthly", "annual", "custom"].map((item) => <SelectItem key={item} value={item} className="capitalize">{item}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-2"><Label htmlFor="credit-anchor">Cycle start</Label><Input id="credit-anchor" type="date" value={anchor} onChange={(event) => setAnchor(event.target.value)} /></div>
            {cadence === "custom" ? <div className="space-y-2"><Label htmlFor="credit-days">Cycle days</Label><Input id="credit-days" type="number" min="1" value={cycleDays} onChange={(event) => setCycleDays(event.target.value)} /></div> : null}
          </> : <>
            <div className="space-y-2"><Label htmlFor="grant-start">Grant start</Label><Input id="grant-start" type="date" value={grantStart} onChange={(event) => setGrantStart(event.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor="grant-expiry">Expires (optional)</Label><Input id="grant-expiry" type="date" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} /></div>
          </>}
        </div>
        <SheetFooter className="border-t px-6 py-5"><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={save} disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : null}{editing ? "Save changes" : "Connect and track"}</Button></SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function CreditBreakdown({ pool }: { pool: Pool }) {
  const [groupBy, setGroupBy] = useState("developer");
  const [data, setData] = useState<Breakdown | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    const response = await fetch(`/api/tools/api-credit-pools/${pool.id}/usage?groupBy=${groupBy}`);
    const body = await response.json().catch(() => ({}));
    setData(response.ok ? body : null);
    setLoading(false);
  }, [pool.id, groupBy]);
  useEffect(() => { void load(); }, [load]);

  async function mapKey(externalKeyId: string, developerId: string) {
    const key = data?.keys.find((item) => item.externalKeyId === externalKeyId);
    if (!key) return;
    await fetch(`/api/integrations/${pool.connectionId}/api-keys/${key.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ developerId: developerId === "unassigned" ? null : developerId }) });
    await load();
  }

  return <div className="mt-6 border-t pt-5">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h4 className="text-sm font-semibold">Usage attribution</h4><p className="mt-1 text-xs text-muted-foreground">Verified provider spend allocated using gateway and API-key usage weights.</p></div><Select value={groupBy} onValueChange={setGroupBy}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="developer">Developers</SelectItem><SelectItem value="api_key">API keys</SelectItem><SelectItem value="project">Projects / workspaces</SelectItem><SelectItem value="model">Models</SelectItem></SelectContent></Select></div>
    {loading ? <div className="flex items-center py-8 text-sm text-muted-foreground"><Loader2 className="mr-2 size-4 animate-spin" />Loading usage</div> : data?.rows.length ? <Table><TableHeader><TableRow><TableHead>{groupBy.replace("_", " ")}</TableHead><TableHead className="text-right">Requests</TableHead><TableHead className="text-right">Tokens</TableHead><TableHead className="text-right">{data.verifiedAvailable ? "Allocated verified" : "Estimated usage"}</TableHead><TableHead className="text-right">Pending</TableHead></TableRow></TableHeader><TableBody>{data.rows.map((row) => <TableRow key={row.key}><TableCell><div className="font-medium">{row.label}</div>{groupBy === "api_key" && row.externalApiKeyId ? <Select value={data.keys.find((key) => key.externalKeyId === row.externalApiKeyId)?.developerId ?? "unassigned"} onValueChange={(value) => mapKey(row.externalApiKeyId!, value)}><SelectTrigger size="sm" className="mt-2"><SelectValue placeholder="Map developer" /></SelectTrigger><SelectContent><SelectItem value="unassigned">Unassigned</SelectItem>{data.developers.map((developer) => <SelectItem key={developer.id} value={developer.id}>{developer.name} · {developer.email}</SelectItem>)}</SelectContent></Select> : null}</TableCell><TableCell className="text-right tabular-nums">{row.requests.toLocaleString()}</TableCell><TableCell className="text-right tabular-nums">{formatCompactNumber(Number(BigInt(row.tokens)))}</TableCell><TableCell className="text-right tabular-nums">{formatMicrosAsCurrency(data.verifiedAvailable ? row.allocatedVerifiedMicros : row.estimatedMicros)}</TableCell><TableCell className="text-right tabular-nums">{formatMicrosAsCurrency(row.pendingEstimatedMicros)}</TableCell></TableRow>)}</TableBody></Table> : <p className="py-6 text-sm text-muted-foreground">No API usage in this period.</p>}
  </div>;
}

export function ApiCreditInventory() {
  const [pools, setPools] = useState<Pool[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Pool | null>(null);
  const [syncing, setSyncing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [poolResponse, integrationResponse] = await Promise.all([fetch("/api/tools/api-credit-pools"), fetch("/api/integrations")]);
    const [poolBody, integrationBody] = await Promise.all([poolResponse.json().catch(() => ({})), integrationResponse.json().catch(() => ({}))]);
    if (!poolResponse.ok || !integrationResponse.ok) setError(poolBody.error ?? integrationBody.error ?? "Could not load API credits");
    else { setPools(poolBody.pools ?? []); setConnections(integrationBody.connections ?? []); setError(null); }
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);
  const totals = useMemo(() => pools.reduce((value, pool) => ({ budget: value.budget + BigInt(pool.budgetMicros), verified: value.verified + BigInt(pool.verifiedSpentMicros ?? 0), pending: value.pending + BigInt(pool.pendingEstimatedMicros), remaining: value.remaining + BigInt(pool.projectedRemainingMicros) }), { budget: BigInt(0), verified: BigInt(0), pending: BigInt(0), remaining: BigInt(0) }), [pools]);

  async function sync(pool: Pool) {
    setSyncing(pool.id);
    const response = await fetch(`/api/integrations/${pool.connectionId}/sync`, { method: "POST" });
    if (!response.ok) setError("Provider sync failed. Check the credential and try again.");
    await load();
    setSyncing(null);
  }
  async function archive(pool: Pool) {
    if (!window.confirm(`Archive ${pool.name}? Historical usage will remain available in Activity.`)) return;
    await fetch(`/api/tools/api-credit-pools/${pool.id}`, { method: "DELETE" });
    await load();
  }

  return <div className="space-y-10">
    <div className="grid items-start gap-y-8 sm:grid-cols-2 xl:grid-cols-4"><SignalsKpi label="Configured credits" hero className="pl-5" value={formatMicrosAsCurrency(totals.budget)} sub="OpenAI and Anthropic"/><SignalsKpi label="Verified spend" className="sm:border-l sm:border-border sm:pl-8" value={formatMicrosAsCurrency(totals.verified)} sub="Provider reported"/><SignalsKpi label="Pending estimate" className="xl:border-l xl:border-border xl:pl-8" value={formatMicrosAsCurrency(totals.pending)} sub="Since last cost sync"/><SignalsKpi label="Projected remaining" className="sm:border-l sm:border-border sm:pl-8" value={formatMicrosAsCurrency(totals.remaining)} sub="Verified plus pending"/></div>
    <Panel as="section"><SignalsSectionHeader title="API credit pools." description="Configured budgets minus provider-verified API spend." bordered action={<Button size="sm" className="rounded-none" onClick={() => { setEditing(null); setSheetOpen(true); }} disabled={pools.length >= 2}><Plus /> Add provider</Button>}/>
      {error ? <Alert variant="destructive" className="mb-4"><AlertDescription>{error}</AlertDescription></Alert> : null}
      {loading ? <div className="flex min-h-48 items-center justify-center text-muted-foreground"><Loader2 className="mr-2 size-4 animate-spin" />Loading API credits</div> : pools.length ? <div className="divide-y">{pools.map((pool) => <article key={pool.id} className="py-6">
        <div className="flex flex-wrap items-start justify-between gap-4"><div className="flex items-center gap-3"><ToolLogoTile tool={pool.provider === "openai" ? "chatgpt-codex" : "claude"} size="lg"/><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{pool.name}</h3>{pool.rawRatio >= 1 ? <span className="bg-destructive px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-destructive-foreground">Over budget</span> : null}{pool.connection.degraded || pool.connection.status === "disconnected" ? <span className="bg-amber-100 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-amber-900 dark:bg-amber-950 dark:text-amber-200">{pool.connection.status === "disconnected" ? "Disconnected" : "Degraded"}</span> : null}</div><p className="mt-1 text-xs text-muted-foreground">{pool.mode === "recurring" ? `${pool.billingCadence} · ${formatShortDate(pool.period.start)}–${formatShortDate(pool.period.end)}` : `Fixed grant · ${formatShortDate(pool.period.start)}${pool.expiresAt ? `–${formatShortDate(pool.expiresAt)}` : " · no expiry"}`} · {pool.connection.status}</p></div></div><div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => sync(pool)} disabled={syncing === pool.id || pool.connection.status === "disconnected"}>{syncing === pool.id ? <Loader2 className="animate-spin" /> : <RefreshCw />}Sync</Button><Button size="sm" variant="outline" onClick={() => { setEditing(pool); setSheetOpen(true); }}><Pencil />Edit</Button><Button size="sm" variant="ghost" onClick={() => archive(pool)} aria-label={`Archive ${pool.name}`}><Archive /></Button></div></div>
        <div className="mt-6 h-2 overflow-hidden bg-muted"><div className={`h-full ${pool.rawRatio >= 1 ? "bg-destructive" : pool.rawRatio >= .85 ? "bg-amber-500" : "bg-primary"}`} style={{ width: `${pool.displayRatio * 100}%` }} /></div>
        <div className="mt-4 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-6"><div><span className="block text-xs text-muted-foreground">Budget</span><strong>{formatMicrosAsCurrency(pool.budgetMicros)}</strong></div><div><span className="block text-xs text-muted-foreground">Verified spend</span><strong>{pool.verifiedSpentMicros == null ? "Unavailable" : formatMicrosAsCurrency(pool.verifiedSpentMicros)}</strong></div><div><span className="block text-xs text-muted-foreground">Verified remaining</span><strong className={pool.verifiedRemainingMicros != null && BigInt(pool.verifiedRemainingMicros) < 0 ? "text-destructive" : ""}>{pool.verifiedRemainingMicros == null ? "Unavailable" : formatMicrosAsCurrency(pool.verifiedRemainingMicros)}</strong></div><div><span className="block text-xs text-muted-foreground">Pending</span><strong>{formatMicrosAsCurrency(pool.pendingEstimatedMicros)}</strong></div><div><span className="block text-xs text-muted-foreground">{pool.verifiedSpentMicros == null ? "Estimated remaining" : "Projected remaining"}</span><strong className={BigInt(pool.projectedRemainingMicros) < 0 ? "text-destructive" : ""}>{formatMicrosAsCurrency(pool.projectedRemainingMicros)}</strong></div><div><span className="block text-xs text-muted-foreground">Forecast</span><strong>{pool.projectedExhaustionAt ? formatShortDate(pool.projectedExhaustionAt) : "Not enough data"}</strong></div></div>
        <p className="mt-3 text-xs text-muted-foreground">{pool.verifiedSpentMicros == null ? "Provider cost-report access is unavailable; remaining is estimated from canonical token usage. " : ""}Last provider sync: {pool.connection.lastSyncedAt ? formatDateTime(pool.connection.lastSyncedAt) : "not synced"}. Remaining is a Junction budget calculation, not the provider wallet balance.</p>
        <CreditBreakdown pool={pool}/>
      </article>)}</div> : <Empty className="min-h-0 py-12"><div className="flex size-10 items-center justify-center bg-muted"><WalletCards className="size-5" /></div><EmptyTitle>Track API credits</EmptyTitle><EmptyDescription>Connect an OpenAI or Anthropic admin key and set the budget or purchased credit amount.</EmptyDescription><Button className="mt-3 rounded-none" onClick={() => setSheetOpen(true)}><KeyRound />Connect provider</Button></Empty>}
    </Panel>
    <PoolSheet open={sheetOpen} onOpenChange={setSheetOpen} connections={connections} editing={editing} onSaved={load}/>
  </div>;
}
