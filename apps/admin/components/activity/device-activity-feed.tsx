"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SignalsSectionHeader } from "@/components/signals/signals-ui";
import type {
  DeviceActivityFeed as DeviceActivityFeedData,
  DeviceActivityItem,
} from "@/lib/queries/activity/device-activity-types";
import { cn } from "@/lib/utils";

function formatWhen(iso: string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}

function formatRelative(iso: string) {
  const ms = Date.now() - Date.parse(iso);
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value < 1 ? 3 : 2,
  }).format(value);
}

function StatusBadge({
  children,
  variant = "default",
}: {
  children: ReactNode;
  variant?: "default" | "success" | "warning" | "error";
}) {
  const classes = {
    default: "border-border bg-muted text-muted-foreground",
    success: "border-success/30 bg-success/10 text-success",
    warning: "border-warning/30 bg-warning/10 text-[#9a5f0d]",
    error: "border-destructive/30 bg-destructive/10 text-destructive",
  };
  return (
    <Badge variant="outline" className={cn("text-[0.65rem] uppercase tracking-[0.08em]", classes[variant])}>
      {children}
    </Badge>
  );
}

function itemTitle(item: DeviceActivityItem) {
  if (item.kind === "heartbeat") return "Heartbeat";
  if (item.kind === "sync") {
    return item.syncKind === "usage" ? "Usage sync" : "Account sync";
  }
  return item.eventType.replaceAll("_", " ");
}

function itemSummary(item: DeviceActivityItem) {
  if (item.kind === "heartbeat") {
    return `${item.device.hostname} · agent ${item.device.agentVersion} · ${item.device.os}`;
  }
  if (item.kind === "sync") {
    const { tools, accounts, quotas, usage } = item.extraction;
    return `${item.device.hostname} · ${tools.length} tools · ${accounts.length} accounts · ${quotas.length} quotas · ${usage.length} usage rows`;
  }
  const version =
    item.currentVersion && item.currentVersion !== item.targetVersion
      ? `${item.currentVersion} → ${item.targetVersion}`
      : item.targetVersion;
  return `${item.device.hostname} · ${version}${item.stage ? ` · ${item.stage}` : ""}`;
}

function itemBadge(item: DeviceActivityItem): { label: string; variant: "success" | "warning" | "error" | "default" } {
  if (item.kind === "heartbeat") {
    return item.device.online
      ? { label: "online", variant: "success" }
      : { label: "offline", variant: "warning" };
  }
  if (item.kind === "sync") {
    return { label: item.syncKind, variant: "default" };
  }
  if (item.eventType.includes("failed") || item.errorCode) {
    return { label: item.errorCode ?? "failed", variant: "error" };
  }
  if (item.eventType.includes("confirmed")) {
    return { label: "confirmed", variant: "success" };
  }
  return { label: item.eventType.split("_")[0] ?? "update", variant: "default" };
}

function ExtractionLog({ item }: { item: Extract<DeviceActivityItem, { kind: "sync" }> }) {
  const { tools, accounts, quotas, usage } = item.extraction;
  return (
    <div className="mt-4 space-y-4 border-t border-border/70 pt-4 text-xs">
      <div>
        <p className="mb-2 font-medium uppercase tracking-[0.06em] text-muted-foreground">Tools extracted</p>
        {tools.length ? (
          <ul className="space-y-1.5 font-mono text-[11px] leading-5 text-foreground/90">
            {tools.map((tool) => (
              <li key={`${tool.toolName}-${tool.lastCheckedAt}`}>
                {tool.toolName}
                {tool.version ? `@${tool.version}` : ""}
                {" · "}
                {tool.detected ? "detected" : "not detected"}
                {tool.configured ? " · configured" : ""}
                {" · checked "}
                {formatWhen(tool.lastCheckedAt)}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground">No tools recorded.</p>
        )}
      </div>

      <div>
        <p className="mb-2 font-medium uppercase tracking-[0.06em] text-muted-foreground">Accounts extracted</p>
        {accounts.length ? (
          <ul className="space-y-1.5 font-mono text-[11px] leading-5 text-foreground/90">
            {accounts.map((account) => (
              <li key={`${account.toolName}-${account.updatedAt}`}>
                {account.toolName}
                {" · "}
                {account.email ?? "no email"}
                {" · "}
                {account.plan ?? "unknown plan"}
                {" · "}
                {account.loginMethod}
                {account.authPresent ? " · auth present" : " · no auth"}
                {" · "}
                {formatWhen(account.updatedAt)}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground">No accounts recorded.</p>
        )}
      </div>

      <div>
        <p className="mb-2 font-medium uppercase tracking-[0.06em] text-muted-foreground">Quotas extracted</p>
        {quotas.length ? (
          <ul className="space-y-1.5 font-mono text-[11px] leading-5 text-foreground/90">
            {quotas.map((quota) => (
              <li key={`${quota.toolName}-${quota.windowType}-${quota.updatedAt}`}>
                {quota.toolName}
                {" · "}
                {quota.windowType}
                {" · "}
                {quota.usedPercent != null ? `${Math.round(quota.usedPercent)}% used` : "usage n/a"}
                {quota.creditsRemaining != null ? ` · ${quota.creditsRemaining} credits` : ""}
                {" · "}
                {quota.source}
                {" · "}
                {formatWhen(quota.updatedAt)}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground">No quotas recorded.</p>
        )}
      </div>

      <div>
        <p className="mb-2 font-medium uppercase tracking-[0.06em] text-muted-foreground">Usage rows extracted</p>
        {usage.length ? (
          <ul className="space-y-1.5 font-mono text-[11px] leading-5 text-foreground/90">
            {usage.map((row) => (
              <li key={`${row.date}-${row.toolName}-${row.model}-${row.metricKind}`}>
                {row.date}
                {" · "}
                {row.toolName}
                {" · "}
                {row.model || "unknown model"}
                {" · "}
                {row.requests} req
                {" · "}
                {row.inputTokens + row.outputTokens} tokens
                {" · "}
                {money(row.estimatedCost)}
                {" · "}
                {row.metricKind}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground">No usage aggregates recorded.</p>
        )}
      </div>
    </div>
  );
}

function FeedRow({
  item,
  showDeveloper,
}: {
  item: DeviceActivityItem;
  showDeveloper: boolean;
}) {
  const [open, setOpen] = useState(false);
  const expandable = item.kind === "sync";
  const badge = itemBadge(item);

  return (
    <li className="border-b border-border/60 last:border-b-0">
      <button
        type="button"
        disabled={!expandable}
        onClick={() => expandable && setOpen((value) => !value)}
        className={cn(
          "flex w-full items-start justify-between gap-3 py-5 text-left transition-colors",
          expandable ? "hover:bg-muted/30" : "cursor-default",
        )}
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium capitalize">{itemTitle(item)}</p>
            <StatusBadge variant={badge.variant}>{badge.label}</StatusBadge>
            {expandable ? (
              <ChevronDown
                className={cn("size-3.5 text-muted-foreground transition-transform", open && "rotate-180")}
              />
            ) : null}
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">{itemSummary(item)}</p>
          {showDeveloper && item.developer ? (
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {item.developer.name} · {item.developer.email}
            </p>
          ) : null}
          {item.kind === "agent_update" && item.errorCode ? (
            <p className="mt-1 font-mono text-[11px] text-destructive">{item.errorCode}</p>
          ) : null}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-xs text-muted-foreground">{formatRelative(item.at)}</p>
          <p className="mt-1 text-[11px] text-muted-foreground/80">{formatWhen(item.at)}</p>
        </div>
      </button>
      {expandable && open ? (
        <div className="pb-5">
          <ExtractionLog item={item} />
        </div>
      ) : null}
    </li>
  );
}

export function DeviceActivityFeed({
  feed,
  showDeveloper = false,
}: {
  feed: DeviceActivityFeedData;
  showDeveloper?: boolean;
}) {
  return (
    <section className="mt-10 border bg-card p-5">
      <SignalsSectionHeader
        title="Device activity."
        description="Heartbeats from last-seen presence, sync updates with extracted inventory, and agent update events. Sync details reflect the latest extracted data tied to each sync timestamp."
        bordered={false}
      />
      {feed.items.length ? (
        <ul className="max-h-[32rem] overflow-y-auto">
          {feed.items.map((item) => (
            <FeedRow key={item.id} item={item} showDeveloper={showDeveloper} />
          ))}
        </ul>
      ) : (
        <p className="py-6 text-sm text-muted-foreground">No device heartbeats or sync updates yet.</p>
      )}
    </section>
  );
}

export function ScrollableMetricList({ children }: { children: ReactNode }) {
  return <div className="max-h-80 overflow-y-auto">{children}</div>;
}
