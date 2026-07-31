"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
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
import { SignalsKpi } from "@/components/signals/signals-ui";
import { LocalSyncPanel } from "@/components/dashboard/local-sync-panel";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import { formatRelativeTime } from "@/lib/format";
import type { DeviceSyncStatus, OrgDeviceSyncRow, OrgDeviceSyncStatus } from "@/lib/queries/team/device-syncs";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<DeviceSyncStatus, string> = {
  online: "Online",
  stale: "Stale",
  repair_required: "Needs repair",
  never_synced: "Never synced",
};

const REQUEST_STATUS_LABEL: Record<string, string> = {
  queued: "Waiting",
  claimed: "Accepted",
  running: "Running",
  succeeded: "Synced",
  failed: "Failed",
  expired: "Expired",
};

function statusBadgeVariant(status: DeviceSyncStatus): "default" | "outline" | "secondary" {
  if (status === "online") return "default";
  if (status === "never_synced") return "secondary";
  return "outline";
}

export function TeamSyncsPanel({ syncs }: { syncs: OrgDeviceSyncStatus }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | DeviceSyncStatus>("all");
  const latestSeen = latest(syncs.devices.map((row) => row.lastSeenAt));
  const latestUsage = latest(syncs.devices.map((row) => row.lastUsageSyncAt));
  const latestAccount = latest(syncs.devices.map((row) => row.lastAccountSyncAt));
  const repairRequired = syncs.totals.repairRequired ?? 0;

  const rows = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return syncs.devices.filter((row) => {
      if (status !== "all" && row.status !== status) return false;
      if (!normalized) return true;
      return [row.hostname, row.developer.name, row.developer.email, row.os, row.architecture, row.agentVersion].some(
        (value) => value.toLowerCase().includes(normalized),
      );
    });
  }, [query, status, syncs.devices]);

  if (!syncs.devices.length) {
    return (
      <Empty className="min-h-0 gap-1 border-0 p-8 md:p-10">
        <EmptyDescription>No machines enrolled yet. Invite a teammate and install the agent.</EmptyDescription>
      </Empty>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <LocalSyncPanel
          scope="team"
          lastSeenAt={latestSeen}
          lastUsageSyncAt={latestUsage}
          lastAccountSyncAt={latestAccount}
          dashboardReady
          dirtyDayCount={0}
          staleDeviceCount={syncs.totals.stale + repairRequired}
        />
      </div>

      <div className="mb-6 grid items-start gap-y-8 sm:grid-cols-2 xl:grid-cols-4">
        <SignalsKpi label="Machines" className="pl-5" value={syncs.totals.total} sub="Active enrollments" />
        <SignalsKpi label="Online" className="sm:pl-8" value={syncs.totals.online} sub="Heartbeat within 45m" />
        <SignalsKpi
          label="Stale"
          className="xl:pl-8"
          value={syncs.totals.stale + repairRequired}
          sub={`${repairRequired} needs repair`}
        />
        <SignalsKpi
          label="Never synced"
          className="sm:pl-8"
          value={syncs.totals.neverSynced}
          sub="Enrolled, no usage upload"
        />
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter hostname, person, OS…"
          className="rounded-none sm:max-w-sm"
          aria-label="Filter machines"
        />
        <Select value={status} onValueChange={(value) => setStatus(value as "all" | DeviceSyncStatus)}>
          <SelectTrigger className="w-full rounded-none sm:w-48" aria-label="Filter by sync status">
            <SelectValue placeholder="Sync status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="online">Online</SelectItem>
            <SelectItem value="stale">Stale</SelectItem>
            <SelectItem value="repair_required">Needs repair</SelectItem>
            <SelectItem value="never_synced">Never synced</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <MobileDataList>
        {rows.map((row) => (
          <MobileDataCard key={row.id} className="transition-colors hover:bg-muted/30">
            <Link href={`/team/${row.developer.id}`} prefetch={false} className="block min-w-0">
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium hover:underline">{row.hostname}</p>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {row.developer.name} · {row.developer.email}
                  </p>
                </div>
                <Badge variant={statusBadgeVariant(row.status)} className="shrink-0 rounded-none">
                  {STATUS_LABEL[row.status]}
                </Badge>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
                <MobileDataField label="Platform" value={`${row.os}/${row.architecture}`} />
                <MobileDataField label="Agent" value={row.agentVersion || "—"} />
                <MobileDataField label="Last seen" value={formatRelativeTime(row.lastSeenAt)} />
                <MobileDataField label="Usage sync" value={formatRelativeTime(row.lastUsageSyncAt)} />
                <MobileDataField label="Accounts" value={formatRelativeTime(row.lastAccountSyncAt)} />
                <MobileDataField label="Tools" value={formatRelativeTime(row.lastToolsSyncAt)} />
                <MobileDataField
                  label="Latest request"
                  value={row.latestRequest ? REQUEST_STATUS_LABEL[row.latestRequest.status] ?? row.latestRequest.status : "—"}
                />
              </dl>
            </Link>
          </MobileDataCard>
        ))}
      </MobileDataList>
      {!rows.length ? (
        <p className="py-8 text-center text-sm text-muted-foreground md:hidden">No machines match this filter.</p>
      ) : null}

      <Table containerClassName="hidden md:block" className="min-w-[960px] text-left text-sm">
        <TableHeader className="border-b border-border/70 text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground">
          <TableRow>
            <TableHead className="pb-3 pr-4 pt-1 font-medium">Machine</TableHead>
            <TableHead className="pb-3 pr-4 pt-1 font-medium">Person</TableHead>
            <TableHead className="pb-3 pr-4 pt-1 font-medium">Status</TableHead>
            <TableHead className="pb-3 pr-4 pt-1 font-medium">Last seen</TableHead>
            <TableHead className="pb-3 pr-4 pt-1 font-medium">Usage</TableHead>
            <TableHead className="pb-3 pr-4 pt-1 font-medium">Accounts</TableHead>
            <TableHead className="pb-3 pr-4 pt-1 font-medium">Tools</TableHead>
            <TableHead className="pb-3 pr-4 pt-1 font-medium">Request</TableHead>
            <TableHead className="pb-3 pr-4 pt-1 font-medium">Agent</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <SyncTableRow key={row.id} row={row} />
          ))}
          {!rows.length ? (
            <TableRow>
              <TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
                No machines match this filter.
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
    </div>
  );
}

function latest(values: Array<string | null>) {
  let winner: string | null = null;
  let winnerMs = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    if (!value) continue;
    const ms = Date.parse(value);
    if (Number.isFinite(ms) && ms > winnerMs) {
      winner = value;
      winnerMs = ms;
    }
  }
  return winner;
}

function SyncTableRow({ row }: { row: OrgDeviceSyncRow }) {
  return (
    <TableRow className="transition-colors hover:bg-muted/30">
      <TableCell className="py-5 pr-4">
        <Link href={`/team/${row.developer.id}`} prefetch={false} className="group block min-w-0">
          <p className="font-medium group-hover:underline">{row.hostname}</p>
          <p className="text-xs text-muted-foreground">
            {row.os}/{row.architecture}
            {row.hasLocalEndpoint ? " · local sync" : ""}
          </p>
        </Link>
      </TableCell>
      <TableCell className="py-5 pr-4">
        <Link href={`/team/${row.developer.id}`} prefetch={false} className="group block min-w-0">
          <p className="font-medium group-hover:underline">{row.developer.name}</p>
          <p className="truncate text-xs text-muted-foreground">{row.developer.email}</p>
        </Link>
      </TableCell>
      <TableCell className="py-5 pr-4">
        <Badge variant={statusBadgeVariant(row.status)} className={cn("rounded-none")}>
          {STATUS_LABEL[row.status]}
        </Badge>
      </TableCell>
      <TableCell className="py-5 pr-4 tabular-nums text-muted-foreground">
        {formatRelativeTime(row.lastSeenAt)}
      </TableCell>
      <TableCell className="py-5 pr-4 tabular-nums text-muted-foreground">
        {formatRelativeTime(row.lastUsageSyncAt)}
      </TableCell>
      <TableCell className="py-5 pr-4 tabular-nums text-muted-foreground">
        {formatRelativeTime(row.lastAccountSyncAt)}
      </TableCell>
      <TableCell className="py-5 pr-4 tabular-nums text-muted-foreground">
        {formatRelativeTime(row.lastToolsSyncAt)}
      </TableCell>
      <TableCell className="py-5 pr-4 text-muted-foreground">
        {row.latestRequest ? (
          <span className="tabular-nums">
            {REQUEST_STATUS_LABEL[row.latestRequest.status] ?? row.latestRequest.status}
            {row.latestRequest.completedAt ? ` · ${formatRelativeTime(row.latestRequest.completedAt)}` : ""}
          </span>
        ) : (
          "—"
        )}
      </TableCell>
      <TableCell className="py-5 pr-4 text-muted-foreground">
        {row.agentVersion || "—"}
        {row.remoteSyncProtocol < 1 ? " · update needed" : ""}
      </TableCell>
    </TableRow>
  );
}
