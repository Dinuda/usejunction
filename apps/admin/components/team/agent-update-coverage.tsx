"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SignalsKpi, SignalsSectionHeader } from "@/components/signals/signals-ui";

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
    <section className="mt-10 border bg-card p-5">
      <SignalsSectionHeader
        title="Agent update coverage."
        description={`Version ${release.version} · ${release.rolloutHours === 0 ? "immediate rollout" : `${release.rolloutHours}-hour rollout`}`}
        bordered={false}
        action={
          <div className="text-right">
            <p className="text-2xl font-semibold tabular-nums tracking-tight">{metrics.installCoveragePercent}%</p>
            <p className="text-xs text-muted-foreground">confirmed installation</p>
          </div>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Badge variant={release.urgency === "critical" ? "destructive" : "outline"} className="rounded-none">
          {release.urgency}
        </Badge>
      </div>

      <div className="mb-6 grid gap-y-8 sm:grid-cols-2 xl:grid-cols-4">
        <SignalsKpi
          label="Pulled update"
          className="pl-5"
          value={metrics.downloaded}
          sub={`${metrics.pullCoveragePercent}% of ${metrics.total} devices`}
        />
        <SignalsKpi
          label="Installed + restarted"
          className="sm:border-l sm:border-border sm:pl-8"
          value={metrics.confirmed}
          sub={`${metrics.downloadToInstallPercent}% of downloads`}
        />
        <SignalsKpi
          label="Currently failed"
          className="xl:border-l xl:border-border xl:pl-8"
          value={metrics.failed}
          sub={`${metrics.failureRatePercent}% of attempts`}
        />
        <SignalsKpi
          label="Currently eligible"
          className="sm:border-l sm:border-border sm:pl-8"
          value={metrics.eligible}
          sub={`${metrics.pendingOnline} pending online · ${metrics.pendingOffline} offline`}
        />
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
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
            {states.map((value) => (
              <SelectItem key={value} value={value}>
                {value.replaceAll("_", " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="border-b border-border/70 text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground">
            <tr>
              <th className="pb-3 pr-4 pt-1 font-medium">Machine</th>
              <th className="pb-3 pr-4 pt-1 font-medium">Developer</th>
              <th className="pb-3 pr-4 pt-1 font-medium">Version</th>
              <th className="pb-3 pr-4 pt-1 font-medium">Stage</th>
              <th className="pb-3 pr-4 pt-1 font-medium">Update activity</th>
              <th className="pb-3 pr-4 pt-1 font-medium">Last seen</th>
              <th className="pb-3 pr-4 pt-1 font-medium">Failure</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.attemptId} className="transition-colors hover:bg-muted/30">
                <td className="py-5 pr-4">
                  <p className="font-medium">{row.device.hostname}</p>
                  <p className="text-xs text-muted-foreground">
                    {row.device.os}/{row.device.architecture}
                  </p>
                </td>
                <td className="py-5 pr-4">
                  <p>{row.device.user.name}</p>
                  <p className="text-xs text-muted-foreground">{row.device.user.email}</p>
                </td>
                <td className="py-5 pr-4 font-mono text-xs tabular-nums">
                  {row.device.agentVersion} → {row.targetVersion}
                </td>
                <td className="py-5 pr-4">
                  <Badge variant="outline" className="rounded-none">
                    {row.state.replaceAll("_", " ")}
                  </Badge>
                </td>
                <td className="py-5 pr-4 text-xs text-muted-foreground">{formatTime(row.lastEventAt)}</td>
                <td className="py-5 pr-4 text-xs text-muted-foreground">{formatTime(row.device.lastSeenAt)}</td>
                <td className="py-5 pr-4 text-xs text-destructive">
                  {row.lastErrorCode ? `${row.lastErrorStage ?? "update"}: ${row.lastErrorCode}` : "—"}
                </td>
              </tr>
            ))}
            {!rows.length ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-muted-foreground">
                  No devices match this filter.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
