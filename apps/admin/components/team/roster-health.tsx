"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { ToolLogoTile } from "@/components/tools/tool-brand-icon";

type Developer = {
  manualPlans: unknown[];
  devices: Array<{ toolInstallations: Array<{ toolName: string }> }>;
  toolEvidence: Array<{ toolName: string }>;
};

type Subscription = {
  id: string;
  toolKey: string | null;
  name: string;
  tier: string | null;
  seatCapacity: number;
  assignedSeats: number;
  availableSeats: number;
};

function Metric({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="border-l-2 border-primary/40 pl-4">
      <p className="font-mono text-[0.65rem] uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">{value}</p>
      {sub ? <p className="mt-1 text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

function MetricSkeleton() {
  return (
    <div className="border-l-2 border-primary/20 pl-4">
      <div className="h-3 w-16 bg-muted" />
      <div className="mt-3 h-8 w-12 bg-muted" />
    </div>
  );
}

function detectedToolCount(developer: Developer) {
  return new Set([
    ...developer.devices.flatMap((device) => device.toolInstallations.map((tool) => tool.toolName)),
    ...developer.toolEvidence.map((tool) => tool.toolName),
  ]).size;
}

function toolLabel(toolKey: string | null) {
  if (!toolKey) return "Tool";
  if (toolKey === "chatgpt-codex") return "ChatGPT";
  if (toolKey === "github-copilot") return "Copilot";
  return toolKey.charAt(0).toUpperCase() + toolKey.slice(1);
}

export function RosterHealth({
  online,
  devices,
  gaps,
}: {
  online: number;
  devices: number;
  gaps: number;
}) {
  const [developers, setDevelopers] = useState<Developer[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const [developersRes, subscriptionsRes] = await Promise.all([
        fetch("/api/dashboard/developers"),
        fetch("/api/tools/subscriptions"),
      ]);
      const developersJson = await developersRes.json().catch(() => ({}));
      const subscriptionsJson = await subscriptionsRes.json().catch(() => ({}));
      if (developersRes.ok && subscriptionsRes.ok) {
        setDevelopers(developersJson.developers ?? []);
        setSubscriptions(subscriptionsJson.subscriptions ?? []);
      }
      setLoading(false);
    })();
  }, []);

  const covered = developers.filter((developer) => developer.manualPlans.length > 0).length;
  const needsPlan = developers.filter(
    (developer) => detectedToolCount(developer) > 0 && developer.manualPlans.length === 0,
  ).length;
  const seatsFree = subscriptions.reduce((sum, subscription) => sum + subscription.availableSeats, 0);
  const seatsBought = subscriptions.reduce((sum, subscription) => sum + subscription.seatCapacity, 0);
  const total = developers.length;
  const healthy = !loading && total > 0 && gaps === 0 && needsPlan === 0;

  const status = (() => {
    if (loading) return null;
    if (healthy) {
      return `Roster is healthy — ${covered}/${total} covered.`;
    }
    const parts = [
      gaps > 0 ? `${gaps} tool ${gaps === 1 ? "gap" : "gaps"} (detected, not configured)` : null,
      needsPlan > 0
        ? `${needsPlan} ${needsPlan === 1 ? "person needs" : "people need"} a plan`
        : null,
    ].filter(Boolean);
    return parts.length ? parts.join(" · ") : null;
  })();

  const showGaps = gaps > 0;
  const showNeedsPlan = !loading && needsPlan > 0;
  const metricCount = 2 + (showGaps ? 1 : 0) + (showNeedsPlan ? 1 : 0);

  return (
    <>
      <div className="border-b pb-8">
        {status ? <p className="text-sm leading-6 text-muted-foreground">{status}</p> : null}

        <div
          className={`grid gap-6 ${status ? "mt-5" : ""} sm:grid-cols-2 ${
            metricCount >= 4 ? "lg:grid-cols-4" : metricCount === 3 ? "lg:grid-cols-3" : "lg:grid-cols-2"
          }`}
        >
          <Metric label="Online" value={`${online}/${devices}`} sub="last 5 minutes" />
          {loading ? <MetricSkeleton /> : <Metric label="Covered" value={`${covered}/${total}`} />}
          {showGaps ? <Metric label="Gaps" value={gaps} sub="detected, not configured" /> : null}
          {showNeedsPlan ? <Metric label="Needs a plan" value={needsPlan} /> : null}
        </div>
      </div>

      <section className="mt-10">
        <div className="mb-4 flex items-end justify-between gap-3 border-b pb-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Plans.</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {loading
                ? "What's bought and ready to assign."
                : subscriptions.length
                  ? `${seatsBought} purchased · ${seatsFree} available to assign`
                  : "What's bought and ready to assign."}
            </p>
          </div>
          <Link
            href="/tools"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Manage tools
            <ArrowUpRight className="size-3.5" />
          </Link>
        </div>

        {loading ? (
          <ul className="divide-y">
            {[0, 1].map((index) => (
              <li key={index} className="flex items-center gap-3 py-4">
                <div className="size-10 bg-muted" />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="h-4 w-40 bg-muted" />
                  <div className="h-3 w-56 bg-muted" />
                </div>
              </li>
            ))}
          </ul>
        ) : subscriptions.length ? (
          <ul className="divide-y">
            {subscriptions.map((subscription) => (
              <li key={subscription.id} className="flex items-center justify-between gap-3 py-4">
                <div className="flex min-w-0 items-center gap-3">
                  <ToolLogoTile tool={subscription.toolKey ?? subscription.name} size="md" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {toolLabel(subscription.toolKey)} · {subscription.name}
                    </p>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {subscription.seatCapacity} purchased · {subscription.assignedSeats} assigned ·{" "}
                      {subscription.availableSeats} free
                    </p>
                  </div>
                </div>
                <p className="shrink-0 text-sm tabular-nums text-muted-foreground">
                  {subscription.assignedSeats}/{subscription.seatCapacity}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <div className="py-8">
            <p className="text-sm text-muted-foreground">No plans bought yet.</p>
            <Link
              href="/tools"
              className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-foreground underline-offset-4 hover:underline"
            >
              Add a tool
              <ArrowUpRight className="size-3.5" />
            </Link>
          </div>
        )}
      </section>
    </>
  );
}
