import {
  isSecondaryQuotaWindow,
  quotaRemainingLabel,
  quotaSignalLabel,
  quotaWindowLabel,
} from "@/lib/quotas/display";
import {
  projectQuotaPace,
  type QuotaPace,
  type QuotaPaceCode,
} from "@/lib/quotas/pace";
import {
  dedupeQuotaUtilizations,
  mapQuotaSnapshots,
  selectPrimaryQuota,
  type QuotaSnapshotInput,
  type QuotaUtilization,
} from "@/lib/quotas/plan-utilization-policy";
import {
  canonicalToolKey,
  findCatalogPlan,
  findCatalogTool,
  toolDisplayName,
} from "@/lib/tools/catalog";

export type PlanWindowKind = "plan" | "promo" | "credits" | "other";

export type MemberPlanWindow = {
  quotaKey: string;
  windowType: string;
  windowLabel: string;
  kind: PlanWindowKind;
  usedPercent: number | null;
  remaining: number | null;
  remainingLabel: string | null;
  resetsAt: string | null;
  signal: string;
  stale: boolean;
};

export type MemberPlanBoardCard = {
  toolKey: string;
  /** Original tool name for brand icons. */
  toolName: string;
  toolLabel: string;
  planName: string | null;
  accountEmail: string | null;
  pace: QuotaPace;
  primary: MemberPlanWindow | null;
  /** Promos, grants, bonus credits, rate-limit inventories. */
  promotions: MemberPlanWindow[];
  /** Non-primary, non-promo windows (e.g. secondary plan windows). */
  otherWindows: MemberPlanWindow[];
  /** Period usage folded onto the product card. */
  usage: {
    requests: number;
    tokens: number;
    cost: number;
  } | null;
};

function windowKind(windowType: string): PlanWindowKind {
  if (/promo|grant|bonus/i.test(windowType)) return "promo";
  if (/rate_limit_resets|^credits$/i.test(windowType)) return "credits";
  if (isSecondaryQuotaWindow(windowType)) return "other";
  return "plan";
}

function toWindow(row: QuotaUtilization): MemberPlanWindow {
  const remainingLabel = quotaRemainingLabel(row.remaining, row.windowType);
  return {
    quotaKey: row.quotaKey,
    windowType: row.windowType,
    windowLabel: quotaWindowLabel(row.windowType),
    kind: windowKind(row.windowType),
    usedPercent: row.rawRatio == null ? null : row.rawRatio * 100,
    remaining: row.remaining,
    remainingLabel,
    resetsAt: row.resetsAt,
    signal: quotaSignalLabel({
      windowType: row.windowType,
      rawRatio: row.rawRatio,
      remaining: row.remaining,
      resetsAt: row.resetsAt,
    }),
    stale: row.stale,
  };
}

function catalogPlanDisplayName(toolKey: string, planKey: string | null | undefined): string | null {
  const raw = planKey?.trim();
  if (!raw) return null;
  const tool = findCatalogTool(toolKey);
  if (!tool) return raw;
  const direct = findCatalogPlan(toolKey, raw);
  if (direct?.name) return direct.name;
  const normalized = raw.toLowerCase().replace(/[_\s]+/g, "-");
  const byKey = tool.plans.find((plan) => plan.key === normalized);
  if (byKey?.name) return byKey.name;
  const byName = tool.plans.find((plan) => plan.name.toLowerCase() === raw.toLowerCase());
  return byName?.name ?? raw;
}

function pickPlanName(
  toolKey: string,
  accounts: Array<{ toolName: string; plan: string | null; email: string | null }>,
  assignedPlans: Array<{ provider: string; product: string; plan: string | null }>,
): { planName: string | null; accountEmail: string | null } {
  const account = accounts.find((row) => canonicalToolKey(row.toolName) === toolKey);
  if (account?.plan?.trim()) {
    return {
      planName: catalogPlanDisplayName(toolKey, account.plan),
      accountEmail: account.email,
    };
  }
  const assigned = assignedPlans.find((row) => {
    const hay = `${row.provider} ${row.product} ${row.plan ?? ""}`.toLowerCase();
    return hay.includes(toolKey.replace(/-/g, " ")) || hay.includes(toolKey);
  });
  return {
    planName:
      catalogPlanDisplayName(toolKey, assigned?.plan) ||
      assigned?.plan?.trim() ||
      assigned?.product ||
      null,
    accountEmail: account?.email ?? null,
  };
}

/**
 * Per-tool plan board: primary burn window + promotions/credits still available.
 */
export function buildMemberPlanBoard(input: {
  snapshots: QuotaSnapshotInput[];
  accounts?: Array<{ toolName: string; plan: string | null; email: string | null }>;
  assignedPlans?: Array<{ provider: string; product: string; plan: string | null }>;
  toolsUsage?: Array<{ toolName: string; requests: number; tokens: number; cost: number }>;
  now?: Date;
}): MemberPlanBoardCard[] {
  const now = input.now ?? new Date();
  const rows = dedupeQuotaUtilizations(mapQuotaSnapshots(input.snapshots, now));
  const byTool = new Map<string, QuotaUtilization[]>();
  for (const row of rows) {
    const list = byTool.get(row.toolKey) ?? [];
    list.push(row);
    byTool.set(row.toolKey, list);
  }

  const usageByTool = new Map<
    string,
    { toolName: string; requests: number; tokens: number; cost: number }
  >();
  for (const tool of input.toolsUsage ?? []) {
    const key = canonicalToolKey(tool.toolName) || tool.toolName;
    const existing = usageByTool.get(key);
    if (existing) {
      existing.requests += tool.requests;
      existing.tokens += tool.tokens;
      existing.cost += tool.cost;
    } else {
      usageByTool.set(key, { ...tool });
    }
  }

  const emptyPace = (toolKey: string): QuotaPace => ({
    code: "UNKNOWN",
    toolKey,
    toolLabel: toolDisplayName(toolKey),
    windowType: "unknown",
    windowLabel: "Plan",
    usedPercent: null,
    expectedPercent: null,
    daysToExhaust: null,
    daysToReset: null,
    exhaustAt: null,
    resetsAt: null,
    summary: `${toolDisplayName(toolKey)} has no live plan window.`,
  });

  const cards: MemberPlanBoardCard[] = [];
  const seen = new Set<string>();

  for (const [toolKey, toolRows] of byTool) {
    seen.add(toolKey);
    const primary = selectPrimaryQuota(toolRows);
    const pace = primary ? projectQuotaPace(primary, now) : emptyPace(toolKey);

    const primaryKey = primary?.quotaKey ?? null;
    const promotions: MemberPlanWindow[] = [];
    const otherWindows: MemberPlanWindow[] = [];
    for (const row of toolRows) {
      if (row.quotaKey === primaryKey) continue;
      const window = toWindow(row);
      if (window.kind === "promo" || window.kind === "credits") promotions.push(window);
      else otherWindows.push(window);
    }

    const { planName, accountEmail } = pickPlanName(
      toolKey,
      input.accounts ?? [],
      input.assignedPlans ?? [],
    );
    const usage = usageByTool.get(toolKey) ?? null;

    cards.push({
      toolKey,
      toolName: usage?.toolName ?? primary?.toolKey ?? toolKey,
      toolLabel: toolDisplayName(toolKey),
      planName,
      accountEmail,
      pace,
      primary: primary ? toWindow(primary) : null,
      promotions,
      otherWindows,
      usage: usage
        ? { requests: usage.requests, tokens: usage.tokens, cost: usage.cost }
        : null,
    });
  }

  // Tools with traffic but no quota snapshot still get a card.
  for (const [toolKey, usage] of usageByTool) {
    if (seen.has(toolKey)) continue;
    const { planName, accountEmail } = pickPlanName(
      toolKey,
      input.accounts ?? [],
      input.assignedPlans ?? [],
    );
    cards.push({
      toolKey,
      toolName: usage.toolName,
      toolLabel: toolDisplayName(toolKey),
      planName,
      accountEmail,
      pace: emptyPace(toolKey),
      primary: null,
      promotions: [],
      otherWindows: [],
      usage: { requests: usage.requests, tokens: usage.tokens, cost: usage.cost },
    });
  }

  // Drop products with neither a live quota nor any usage this period.
  const active = cards.filter(
    (card) => card.primary != null || (card.usage != null && card.usage.tokens > 0),
  );

  return active.sort((a, b) => {
    const rank = (code: QuotaPaceCode) =>
      code === "ALREADY_EXCEEDED" ? 0 : code === "EXCESS" ? 1 : code === "ON_TRACK" ? 2 : code === "UNDER" ? 3 : 4;
    const rankDiff = rank(a.pace.code) - rank(b.pace.code);
    if (rankDiff !== 0) return rankDiff;
    const usageDiff = (b.usage?.cost ?? 0) - (a.usage?.cost ?? 0);
    if (usageDiff !== 0) return usageDiff;
    return (b.pace.usedPercent ?? -1) - (a.pace.usedPercent ?? -1);
  });
}

/** Fleet-wide plan KPI — never singles out one product. */
export function planBoardLeadLabel(cards: MemberPlanBoardCard[]): {
  value: string;
  sub: string;
} {
  const live = cards.filter((card) => card.pace.usedPercent != null);
  if (!live.length) {
    return { value: "No signal yet", sub: "plans will show once quotas report" };
  }

  const over = live.filter((c) => c.pace.code === "ALREADY_EXCEEDED").length;
  const excess = live.filter((c) => c.pace.code === "EXCESS").length;
  const onTrack = live.filter((c) => c.pace.code === "ON_TRACK").length;
  const under = live.filter((c) => c.pace.code === "UNDER").length;
  const unavailable = live.filter((c) => c.pace.code === "UNKNOWN").length;
  const countLabel = live.length === 1 ? "1 plan" : `${live.length} plans`;
  const distribution = [
    over > 0 ? `${over} over` : null,
    excess > 0 ? `${excess} above pace` : null,
    onTrack > 0 ? `${onTrack} on pace` : null,
    under > 0 ? `${under} under` : null,
    unavailable > 0 ? `${unavailable} unavailable` : null,
  ].filter((part): part is string => part != null);
  const sub = `${countLabel} · ${distribution.join(" · ")}`;

  if (over > 0) {
    return {
      value: over === 1 ? "1 plan over limit" : `${over} plans over limit`,
      sub,
    };
  }
  if (excess > 0) {
    return {
      value: excess === 1 ? "1 plan above pace" : `${excess} plans above pace`,
      sub,
    };
  }
  if (under > 0) {
    return {
      value: under === 1 ? "1 plan underutilized" : `${under} plans underutilized`,
      sub,
    };
  }
  if (unavailable > 0) {
    return {
      value:
        unavailable === 1
          ? "Pace unavailable for 1 plan"
          : `Pace unavailable for ${unavailable} plans`,
      sub,
    };
  }
  return {
    value: "All plans on pace",
    sub,
  };
}
