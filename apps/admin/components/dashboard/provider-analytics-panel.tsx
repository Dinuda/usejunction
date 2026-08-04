"use client";

import Link from "next/link";
import { ArrowUpRight, CheckCircle2, CircleAlert, Database } from "lucide-react";
import { Panel } from "@/components/panel";
import { SignalsSectionHeader } from "@/components/signals/signals-ui";
import { ToolBrandIcon } from "@/components/tools/tool-brand-icon";
import { Badge } from "@/components/ui/badge";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import { formatCompactNumber, formatUsd } from "@/lib/format";
import { toolDisplayName } from "@/lib/tools/catalog";
import type { OrgOverviewV1 } from "@/lib/insights";

type ProviderCard = OrgOverviewV1["providerCards"][number];

function providerHref(card: ProviderCard) {
  return `/analytics/providers/${encodeURIComponent(card.provider)}/${encodeURIComponent(card.product)}`;
}

function freshness(card: ProviderCard) {
  if (!card.lastSyncedAt) return "Not synced";
  return card.dataThrough ? `Through ${new Date(card.dataThrough).toLocaleDateString()}` : "Sync completed";
}

export function ProviderAnalyticsPanel({ cards }: { cards: ProviderCard[] }) {
  return (
    <Panel as="section" className="mt-10">
      <SignalsSectionHeader
        title="Provider intelligence."
        bordered={false}
        action={<span className="text-xs text-muted-foreground">Spend, adoption, trust</span>}
      />
      {cards.length ? (
        <div className="grid gap-4 lg:grid-cols-3">
          {cards.map((card) => {
            const healthy = card.status === "active";
            const action = card.actions[0];
            return (
              <Link
                key={`${card.provider}:${card.product}`}
                href={providerHref(card)}
                className="group rounded-lg border border-border/70 p-4 transition-colors hover:bg-muted/30"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <ToolBrandIcon tool={card.provider} size={18} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{toolDisplayName(card.provider)}</p>
                      <p className="truncate text-xs text-muted-foreground">{card.product}</p>
                    </div>
                  </div>
                  <ArrowUpRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                </div>
                <div className="mt-5 grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-lg font-semibold tabular-nums">{card.activeDevelopers}</p>
                    <p className="text-xs text-muted-foreground">active people</p>
                  </div>
                  <div>
                    <p className="text-lg font-semibold tabular-nums">{card.activeSeats || "—"}</p>
                    <p className="text-xs text-muted-foreground">paid seats</p>
                  </div>
                  <div>
                    <p className="text-lg font-semibold tabular-nums">{formatUsd(card.spend)}</p>
                    <p className="text-xs text-muted-foreground">reported usage</p>
                  </div>
                  <div>
                    <p className="text-lg font-semibold tabular-nums">{formatCompactNumber(card.requests)}</p>
                    <p className="text-xs text-muted-foreground">requests</p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="gap-1 font-normal">
                    {healthy ? <CheckCircle2 className="size-3 text-primary" /> : <CircleAlert className="size-3 text-warning" />}
                    {healthy ? "Connected" : card.status}
                  </Badge>
                  <Badge variant="outline" className="gap-1 font-normal text-muted-foreground">
                    <Database className="size-3" /> {freshness(card)}
                  </Badge>
                </div>
                {action ? <p className="mt-3 text-xs text-warning">{action}</p> : null}
              </Link>
            );
          })}
        </div>
      ) : (
        <Empty className="min-h-0 gap-1 border-0 p-6 md:p-6">
          <EmptyDescription>Connect a provider to see enterprise usage intelligence.</EmptyDescription>
        </Empty>
      )}
    </Panel>
  );
}

