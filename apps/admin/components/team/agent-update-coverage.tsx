"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Coverage = {
  release: {
    version: string;
    status: string;
    urgency: string;
    rolloutHours: number;
    rolloutStartedAt: string | null;
  };
  metrics: {
    total: number;
    eligible: number;
    offered: number;
    downloaded: number;
    attempted: number;
    confirmed: number;
    failed: number;
    rolledBack: number;
    pendingOnline: number;
    pendingOffline: number;
    pullCoveragePercent: number;
    installCoveragePercent: number;
    downloadToInstallPercent: number;
    failureRatePercent: number;
  };
  devices: Array<{
    attemptId: string;
    device: {
      hostname: string;
      os: string;
      architecture: string;
      agentVersion: string;
      lastSeenAt: string;
      user: { name: string; email: string };
    };
    targetVersion: string;
    state: string;
    lastEventAt: string | null;
    lastErrorStage: string | null;
    lastErrorCode: string | null;
  }>;
};

function metric(value: number, label: string, detail?: string) {
  return (
    <div className="border-l-2 border-border-strong pl-3">
      <p className="text-xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-xs font-medium text-foreground">{label}</p>
      {detail ? <p className="mt-0.5 text-[11px] text-muted-foreground">{detail}</p> : null}
    </div>
  );
}

function formatTime(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function AgentUpdateCoverage({ coverage }: { coverage: Coverage }) {
  const [query, setQuery] = useState("");
  const [state, setState] = useState("all");
  const states = useMemo(() => [...new Set(coverage.devices.map((row) => row.state))].sort(), [coverage.devices]);
  const rows = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return coverage.devices.filter((row) => {
      if (state !== "all" && row.state !== state) return false;
      if (!normalized) return true;
      return [row.device.hostname, row.device.user.name, row.device.user.email, row.device.os, row.device.architecture]
        .some((value) => value.toLowerCase().includes(normalized));
    });
  }, [coverage.devices, query, state]);

  const { release, metrics } = coverage;
  return (
    <section className="mb-10 border border-border bg-card">
      <div className="flex flex-col gap-4 border-b border-border p-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">Agent update coverage</h2>
            <Badge variant={release.urgency === "critical" ? "destructive" : "outline"}>
              {release.urgency}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Version {release.version} · {release.rolloutHours === 0 ? "immediate rollout" : `${release.rolloutHours}-hour rollout`}
          </p>
        </div>
        <div className="text-left sm:text-right">
          <p className="text-2xl font-semibold tabular-nums">{metrics.installCoveragePercent}%</p>
          <p className="text-xs text-muted-foreground">confirmed installation coverage</p>
        </div>
      </div>

      <div className="grid gap-5 border-b border-border p-5 sm:grid-cols-2 lg:grid-cols-4">
        {metric(metrics.downloaded, "Pulled update", `${metrics.pullCoveragePercent}% of ${metrics.total} devices`)}
        {metric(metrics.confirmed, "Installed + restarted", `${metrics.downloadToInstallPercent}% of downloads`)}
        {metric(metrics.failed, "Currently failed", `${metrics.failureRatePercent}% of attempts`)}
        {metric(metrics.eligible, "Currently eligible", `${metrics.pendingOnline} pending online · ${metrics.pendingOffline} offline`)}
      </div>

      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter hostname, developer, OS…"
          className="rounded-none sm:max-w-sm"
        />
        <Select value={state} onValueChange={setState}>
          <SelectTrigger className="w-full rounded-none sm:w-48">
            <SelectValue placeholder="Lifecycle state" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All lifecycle states</SelectItem>
            {states.map((value) => <SelectItem key={value} value={value}>{value.replaceAll("_", " ")}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="border-b border-border bg-muted/35 text-xs uppercase tracking-[0.06em] text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Machine</th>
              <th className="px-4 py-3 font-medium">Developer</th>
              <th className="px-4 py-3 font-medium">Version</th>
              <th className="px-4 py-3 font-medium">Stage</th>
              <th className="px-4 py-3 font-medium">Update activity</th>
              <th className="px-4 py-3 font-medium">Last seen</th>
              <th className="px-4 py-3 font-medium">Failure</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr key={row.attemptId}>
                <td className="px-4 py-3">
                  <p className="font-medium">{row.device.hostname}</p>
                  <p className="text-xs text-muted-foreground">{row.device.os}/{row.device.architecture}</p>
                </td>
                <td className="px-4 py-3">
                  <p>{row.device.user.name}</p>
                  <p className="text-xs text-muted-foreground">{row.device.user.email}</p>
                </td>
                <td className="px-4 py-3 font-mono text-xs">{row.device.agentVersion} → {row.targetVersion}</td>
                <td className="px-4 py-3"><Badge variant="outline">{row.state.replaceAll("_", " ")}</Badge></td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{formatTime(row.lastEventAt)}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{formatTime(row.device.lastSeenAt)}</td>
                <td className="px-4 py-3 text-xs text-destructive">
                  {row.lastErrorCode ? `${row.lastErrorStage ?? "update"}: ${row.lastErrorCode}` : "—"}
                </td>
              </tr>
            ))}
            {!rows.length ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No devices match this filter.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
