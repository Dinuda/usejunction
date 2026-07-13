"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Check, Clipboard, Loader2, RefreshCw } from "lucide-react";
import { InviteTeamForm } from "@/components/onboarding/invite-team-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Invite = { id: string; email: string; role: string; expiresAt: string; acceptedAt?: string | null };
type Domain = { id: string; domain: string; verifiedAt?: string | null };

export function SetupCenter() {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [domain, setDomain] = useState("");
  const [dns, setDns] = useState<{ id: string; name: string; value: string } | null>(null);
  const [telemetry, setTelemetry] = useState<{ token?: string; managedSettings?: unknown; endpoint?: { tokenHint: string } | null } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [organizationSlug, setOrganizationSlug] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [inviteResponse, domainResponse, telemetryResponse, onboardingResponse] = await Promise.all([fetch("/api/organizations/invites"), fetch("/api/organizations/domains"), fetch("/api/telemetry/claude-code"), fetch("/api/onboarding")]);
    if (inviteResponse.ok) setInvites((await inviteResponse.json()).invites ?? []);
    if (domainResponse.ok) setDomains((await domainResponse.json()).domains ?? []);
    if (telemetryResponse.ok) setTelemetry(await telemetryResponse.json());
    if (onboardingResponse.ok) setOrganizationSlug((await onboardingResponse.json()).organization?.slug ?? null);
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  async function addDomain() {
    setBusy("domain");
    const response = await fetch("/api/organizations/domains", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ domain }) });
    const data = await response.json().catch(() => ({}));
    setBusy(null);
    if (response.ok) { setDns({ id: data.domain.id, name: data.dns.name, value: data.dns.value }); setDomain(""); await refresh(); }
  }
  async function verifyDomain(id: string) { setBusy(id); await fetch(`/api/organizations/domains/${id}/verify`, { method: "POST" }); setBusy(null); await refresh(); }
  async function createTelemetry() { setBusy("telemetry"); const response = await fetch("/api/telemetry/claude-code", { method: "POST" }); if (response.ok) setTelemetry(await response.json()); setBusy(null); }
  const settings = telemetry?.managedSettings ? JSON.stringify(telemetry.managedSettings, null, 2) : "";
  async function copySettings() { if (!settings) return; await navigator.clipboard.writeText(settings); setCopied(true); setTimeout(() => setCopied(false), 1500); }

  return <div className="space-y-10">
    <section className="space-y-4"><div><h2 className="text-xl font-semibold">Team subscriptions</h2><p className="mt-1 text-sm text-muted-foreground">Add the paid AI tools your company owns, then assign available seats to developers.</p></div><Card className="shadow-none"><CardContent className="flex flex-col items-start justify-between gap-4 p-6 sm:flex-row sm:items-center"><div><p className="font-medium">Add company tools</p><p className="mt-1 text-sm text-muted-foreground">Choose ChatGPT, Claude, Cursor, or GitHub Copilot and select your plan.</p></div><Button asChild><Link href="/tools">Open subscriptions</Link></Button></CardContent></Card></section>
    <section className="grid gap-5 lg:grid-cols-[1fr_0.9fr]"><Card className="shadow-none"><CardHeader className="border-b"><CardTitle>Invite developers</CardTitle></CardHeader><CardContent className="p-6"><InviteTeamForm onInvited={() => void refresh()} /></CardContent></Card><Card className="shadow-none"><CardHeader className="border-b"><CardTitle>Recent invitations</CardTitle></CardHeader><CardContent className="divide-y p-0">{invites.length ? invites.slice(0, 8).map((invite) => <div key={invite.id} className="flex items-center justify-between gap-3 px-5 py-3"><div><p className="text-sm font-medium">{invite.email}</p><p className="text-xs text-muted-foreground">Expires {new Date(invite.expiresAt).toLocaleDateString()}</p></div><Badge variant="outline" className={invite.acceptedAt ? "border-green-200 bg-green-50 text-green-800" : ""}>{invite.acceptedAt ? "Joined" : "Invited"}</Badge></div>) : <p className="p-5 text-sm text-muted-foreground">No invitations yet.</p>}</CardContent></Card></section>
    <section className="space-y-4"><div><h2 className="text-xl font-semibold">Advanced team access</h2><p className="mt-1 text-sm text-muted-foreground">Verify a company domain for reusable join links.</p></div><Card className="shadow-none"><CardContent className="space-y-5 p-6"><div className="flex max-w-xl flex-col gap-3 sm:flex-row"><div className="flex-1 space-y-2"><Label htmlFor="company-domain">Company domain</Label><Input id="company-domain" value={domain} onChange={(event) => setDomain(event.target.value)} placeholder="acme.com" /></div><Button className="sm:mt-7" variant="outline" onClick={addDomain} disabled={busy === "domain" || !domain.trim()}>{busy === "domain" && <Loader2 className="animate-spin" />}Add domain</Button></div>{dns && <Alert><AlertDescription>Add TXT record <strong>{dns.name}</strong> with value <span className="font-mono text-xs">{dns.value}</span>, then verify below.</AlertDescription></Alert>}{organizationSlug && domains.some((item) => item.verifiedAt) && <div className="space-y-2"><Label>Company join link</Label><div className="flex max-w-2xl"><Input readOnly value={`${window.location.origin}/join/company/${organizationSlug}`} className="font-mono text-xs" /><Button variant="outline" onClick={() => navigator.clipboard.writeText(`${window.location.origin}/join/company/${organizationSlug}`)}><Clipboard />Copy</Button></div></div>}<div className="divide-y border">{domains.length ? domains.map((item) => <div key={item.id} className="flex items-center justify-between gap-4 p-4"><div><p className="text-sm font-medium">{item.domain}</p><p className="text-xs text-muted-foreground">{item.verifiedAt ? "Verified for company joins" : "Waiting for DNS verification"}</p></div>{item.verifiedAt ? <Badge variant="outline" className="border-green-200 bg-green-50 text-green-800"><Check className="size-3" />Verified</Badge> : <Button size="sm" variant="outline" onClick={() => verifyDomain(item.id)} disabled={busy === item.id}>{busy === item.id ? <Loader2 className="animate-spin" /> : <RefreshCw />}Verify</Button>}</div>) : <p className="p-4 text-sm text-muted-foreground">No domains configured.</p>}</div></CardContent></Card></section>
    <section className="space-y-4"><div><h2 className="text-xl font-semibold">Claude Code telemetry</h2><p className="mt-1 text-sm text-muted-foreground">Optional organization-managed metrics export. Logs, traces, prompts, and tool content remain disabled.</p></div><Card className="shadow-none"><CardContent className="space-y-4 p-6">{telemetry?.endpoint && !telemetry.token && <p className="text-sm text-muted-foreground">Telemetry endpoint active · token ending in {telemetry.endpoint.tokenHint}</p>}{settings ? <><div className="relative max-h-72 overflow-auto border bg-zinc-950 p-4 pr-14"><pre className="text-xs leading-5 text-zinc-100">{settings}</pre><button onClick={copySettings} className="absolute right-3 top-3 border border-zinc-700 p-2 text-zinc-300" aria-label="Copy managed settings">{copied ? <Check className="size-4" /> : <Clipboard className="size-4" />}</button></div><p className="text-xs text-muted-foreground">Store this managed settings block now. The token cannot be shown again.</p></> : <Button variant="outline" onClick={createTelemetry} disabled={busy === "telemetry"}>{busy === "telemetry" && <Loader2 className="animate-spin" />}{telemetry?.endpoint ? "Rotate telemetry token" : "Generate managed settings"}</Button>}</CardContent></Card></section>
  </div>;
}
