"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { MobileDataCard, MobileDataField, MobileDataList } from "@/components/ui/mobile-data";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SignalsKpi, SignalsSectionHeader } from "@/components/signals/signals-ui";
import { Panel } from "@/components/panel";
import { formatDateTime } from "@/lib/format";

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
    pending: number;
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
    <Panel as="section" className="mt-10">
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

      <div className="mb-6 grid items-start gap-y-8 sm:grid-cols-2 xl:grid-cols-4">
        <SignalsKpi
          label="Pulled update"
          className="pl-5"
          value={metrics.downloaded}
          sub={`${metrics.pullCoveragePercent}% of ${metrics.total} devices`}
        />
        <SignalsKpi
          label="Installed + restarted"
          className="sm:pl-8"
          value={metrics.confirmed}
          sub={`${metrics.downloadToInstallPercent}% of downloads`}
        />
        <SignalsKpi
          label="Currently failed"
          className="xl:pl-8"
          value={metrics.failed}
          sub={`${metrics.failureRatePercent}% of attempts`}
        />
        <SignalsKpi
          label="Currently eligible"
          className="sm:pl-8"
          value={metrics.eligible}
          sub={`${metrics.pending} awaiting a future heartbeat`}
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

      <MobileDataList>
        {rows.map((row) => (
          <MobileDataCard key={row.attemptId}>
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{row.device.hostname}</p>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {row.device.user.name} · {row.device.user.email}
                </p>
              </div>
              <Badge variant="outline" className="shrink-0 rounded-none">
                {row.state.replaceAll("_", " ")}
              </Badge>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
              <MobileDataField label="Platform" value={`${row.device.os}/${row.device.architecture}`} />
              <MobileDataField label="Version" value={`${row.device.agentVersion} → ${row.targetVersion}`} />
              <MobileDataField label="Update activity" value={row.lastEventAt ? formatDateTime(row.lastEventAt) : "—"} />
              <MobileDataField label="Last seen" value={formatDateTime(row.device.lastSeenAt)} />
              {row.lastErrorCode ? (
                <MobileDataField
                  className="col-span-2 [&_dd]:text-destructive"
                  label="Failure"
                  value={`${row.lastErrorStage ?? "update"}: ${row.lastErrorCode}`}
                />
              ) : null}
            </dl>
          </MobileDataCard>
        ))}
      </MobileDataList>
      {!rows.length ? (
        <p className="py-8 text-center text-sm text-muted-foreground md:hidden">No devices match this filter.</p>
      ) : null}

      <Table containerClassName="hidden md:block" className="min-w-[900px] text-left text-sm">
        <TableHeader className="border-b border-border/70 text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground">
          <TableRow>
            <TableHead className="pb-3 pr-4 pt-1 font-medium">Machine</TableHead>
            <TableHead className="pb-3 pr-4 pt-1 font-medium">Developer</TableHead>
            <TableHead className="pb-3 pr-4 pt-1 font-medium">Version</TableHead>
            <TableHead className="pb-3 pr-4 pt-1 font-medium">Stage</TableHead>
            <TableHead className="pb-3 pr-4 pt-1 font-medium">Update activity</TableHead>
            <TableHead className="pb-3 pr-4 pt-1 font-medium">Last seen</TableHead>
            <TableHead className="pb-3 pr-4 pt-1 font-medium">Failure</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.attemptId} className="transition-colors hover:bg-muted/30">
              <TableCell className="py-5 pr-4">
                <p className="font-medium">{row.device.hostname}</p>
                <p className="text-xs text-muted-foreground">
                  {row.device.os}/{row.device.architecture}
                </p>
              </TableCell>
              <TableCell className="py-5 pr-4">
                <p>{row.device.user.name}</p>
                <p className="text-xs text-muted-foreground">{row.device.user.email}</p>
              </TableCell>
              <TableCell className="py-5 pr-4 font-mono text-xs tabular-nums">
                {row.device.agentVersion} → {row.targetVersion}
              </TableCell>
              <TableCell className="py-5 pr-4">
                <Badge variant="outline" className="rounded-none">
                  {row.state.replaceAll("_", " ")}
                </Badge>
              </TableCell>
              <TableCell className="py-5 pr-4 text-xs text-muted-foreground">{row.lastEventAt ? formatDateTime(row.lastEventAt) : "—"}</TableCell>
              <TableCell className="py-5 pr-4 text-xs text-muted-foreground">{formatDateTime(row.device.lastSeenAt)}</TableCell>
              <TableCell className="py-5 pr-4 text-xs text-destructive">
                {row.lastErrorCode ? `${row.lastErrorStage ?? "update"}: ${row.lastErrorCode}` : "—"}
              </TableCell>
            </TableRow>
          ))}
          {!rows.length ? (
            <TableRow>
              <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                No devices match this filter.
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
    </Panel>
  );
}
