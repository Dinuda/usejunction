"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Laptop2,
  Loader2,
  ShieldCheck,
  Terminal,
  Users,
} from "lucide-react";
import { DeviceConnectCard } from "@/components/onboarding/device-connect-card";
import { InviteTeamForm } from "@/components/onboarding/invite-team-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

type OnboardingStatus = {
  configured: boolean;
  role?: string | null;
  organization?: { name: string; slug: string };
  developer?: {
    devices: Array<{
      id: string;
      hostname: string;
      os: string;
      lastSeenAt: string;
      toolInstallations: Array<{ toolName: string; version?: string | null }>;
    }>;
  } | null;
};

type Path = "choose" | "connect" | "invite";

function StepRail({ active }: { active: 1 | 2 }) {
  return (
    <div className="mb-7 grid grid-cols-[auto_minmax(1rem,1fr)_auto] items-center gap-2 text-[0.7rem] text-muted-foreground sm:gap-3 sm:text-xs" aria-label="Setup progress">
      <span className="flex min-w-0 items-center gap-2 font-medium text-foreground"><span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-[0.68rem] text-primary-foreground">{active === 1 ? "1" : <Check className="size-3.5" />}</span><span className="leading-4">Choose a path</span></span>
      <Separator className="min-w-4" />
      <span className={`flex min-w-0 items-center gap-2 ${active === 2 ? "font-medium text-foreground" : ""}`}><span className={`flex size-6 shrink-0 items-center justify-center rounded-full border text-[0.68rem] ${active === 2 ? "border-primary bg-primary text-primary-foreground" : ""}`}>2</span><span className="max-w-[5.5rem] leading-4 sm:max-w-none">Start seeing value</span></span>
    </div>
  );
}

export function OnboardingExperience() {
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [finishing, setFinishing] = useState(false);
  const [path, setPath] = useState<Path>("choose");

  const refresh = useCallback(async () => {
    const response = await fetch("/api/onboarding", { cache: "no-store" });
    if (response.ok) setStatus(await response.json());
    setLoading(false);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  async function finish(action: "complete" | "skip" = "complete") {
    setFinishing(true);
    await fetch("/api/onboarding", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }) });
    window.location.href = "/dashboard";
  }

  if (loading || !status) {
    return <div className="mx-auto max-w-2xl space-y-5"><div className="h-3 w-28 animate-pulse rounded-full bg-muted" /><div className="h-9 w-3/4 animate-pulse rounded-lg bg-muted" /><div className="h-52 animate-pulse rounded-xl bg-muted" /></div>;
  }

  const isFounder = status.role === "owner" || status.role === "admin";
  const workspaceName = status.organization?.name ?? "your workspace";
  const device = status.developer?.devices[0];

  if (device) {
    return <div className="mx-auto max-w-2xl"><StepRail active={2} /><Card className="overflow-hidden border-green-200/80 shadow-[0_18px_48px_-32px_rgba(21,128,61,0.45)]"><CardHeader className="border-b bg-green-50/70 p-6"><Badge variant="outline" className="w-fit border-green-200 bg-white text-green-700"><CheckCircle2 className="mr-1 size-3.5" /> Connected</Badge><CardTitle className="mt-3 text-2xl">Your workspace is ready.</CardTitle><p className="text-sm leading-6 text-muted-foreground">{device.hostname} is reporting to {workspaceName}. You can invite teammates and connect more tools from the dashboard.</p></CardHeader><CardContent className="space-y-5 p-6"><div className="flex items-center gap-3 rounded-lg border bg-card p-4"><div className="flex size-10 items-center justify-center rounded-md bg-primary/10 text-primary"><Laptop2 className="size-5" /></div><div><p className="font-medium">{device.hostname}</p><p className="text-xs text-muted-foreground">{device.os} · connected just now</p></div></div><Button onClick={() => void finish()} disabled={finishing} className="w-full sm:w-auto">{finishing && <Loader2 className="animate-spin" />} Open dashboard <ArrowRight /></Button></CardContent></Card></div>;
  }

  if (path === "connect" || !isFounder) {
    return <div className="mx-auto max-w-2xl"><StepRail active={2} /><div className="mb-6 flex items-start gap-3"><div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Terminal className="size-5" /></div><div><p className="font-mono text-[0.68rem] uppercase tracking-[0.16em] text-primary">Connect a device</p><h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Connect {isFounder ? "your first computer" : "your computer"}</h2><p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">Run one command in your terminal. We’ll confirm the device here automatically.</p></div></div><DeviceConnectCard title="One command to get started" description="UseJunction reads setup and usage metadata only — never prompts or responses." compact onConnected={() => { void refresh(); void fetch("/api/onboarding", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "complete" }) }); }} /><div className="flex flex-col items-center justify-between gap-3 text-sm text-muted-foreground sm:flex-row"><span className="flex items-center gap-2"><ShieldCheck className="size-4 text-primary" /> Metadata only. Your code stays private.</span><Button variant="ghost" onClick={() => void finish("skip")} disabled={finishing}>Do this later</Button></div></div>;
  }

  if (path === "invite") {
    return <div className="mx-auto max-w-2xl"><StepRail active={2} /><div className="mb-6 flex items-start gap-3"><div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Users className="size-5" /></div><div><p className="font-mono text-[0.68rem] uppercase tracking-[0.16em] text-primary">Invite your team</p><h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Bring your team into {workspaceName}.</h2><p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">They’ll get a secure link, connect their computer, and appear here as soon as they’re ready.</p></div></div><Card className="shadow-[0_18px_48px_-32px_rgba(14,116,144,0.35)]"><CardHeader className="border-b bg-muted/25 p-5"><CardTitle className="text-base">Send invitations</CardTitle></CardHeader><CardContent className="p-5"><InviteTeamForm onInvited={() => void finish()} /></CardContent></Card><div className="mt-3 flex justify-end"><Button variant="ghost" onClick={() => setPath("choose")}>Back to setup choices</Button></div></div>;
  }

  return <div className="mx-auto max-w-2xl"><StepRail active={1} /><Card className="mb-7 overflow-hidden border-primary/15 shadow-[0_18px_48px_-32px_rgba(14,116,144,0.35)]"><CardHeader className="flex flex-row items-start gap-4 border-b bg-card p-6"><div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-yellow/45 text-brand-charcoal"><span className="text-lg font-semibold">U</span></div><div><Badge variant="outline" className="border-primary/20 bg-primary/5 text-primary">{isFounder ? "Your workspace" : "Joined workspace"}</Badge><CardTitle className="mt-3 text-2xl">{workspaceName}</CardTitle><p className="mt-2 text-sm leading-6 text-muted-foreground">{isFounder ? "Choose the path that gets your team to its first useful insight." : "Connect your computer to start sharing useful team context."}</p></div></CardHeader></Card><div className="mb-5"><p className="text-sm font-medium">How would you like to start?</p><p className="mt-1 text-sm text-muted-foreground">You can always do the other one later.</p></div><div className="grid gap-4 sm:grid-cols-2"><button type="button" onClick={() => setPath("connect")} className="group rounded-xl border bg-card p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><Laptop2 className="size-5" /></span><span className="mt-5 block font-medium">Connect my computer</span><span className="mt-2 block text-sm leading-6 text-muted-foreground">See detected tools and device health in a couple of minutes.</span><span className="mt-5 flex items-center gap-2 text-sm font-medium text-primary">Start here <ArrowRight className="size-4 transition group-hover:translate-x-0.5" /></span></button><button type="button" onClick={() => setPath("invite")} className="group rounded-xl border bg-card p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><span className="flex size-10 items-center justify-center rounded-lg bg-brand-yellow/45 text-brand-charcoal"><Users className="size-5" /></span><span className="mt-5 block font-medium">Invite my team</span><span className="mt-2 block text-sm leading-6 text-muted-foreground">Send secure links so everyone can connect without extra setup.</span><span className="mt-5 flex items-center gap-2 text-sm font-medium text-primary">Invite teammates <ArrowRight className="size-4 transition group-hover:translate-x-0.5" /></span></button></div><div className="mt-6 flex justify-center"><Button variant="ghost" onClick={() => void finish("skip")} disabled={finishing}>Do this later</Button></div></div>;
}
