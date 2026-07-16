export type BillingCadence = "weekly" | "monthly" | "annual" | "custom";

export type CatalogPlan = {
  key: string;
  name: string;
  tier: string;
  description: string;
  prices: Partial<Record<BillingCadence, bigint>>;
  includedCycleMicros: bigint;
  customPrice?: boolean;
  minimumSeats?: number;
};

export type CatalogTool = {
  key: string;
  name: string;
  shortName: string;
  provider: string;
  product: string;
  toolName: string;
  aliases: readonly string[];
  sourceUrl: string;
  lastVerifiedAt: string;
  plans: readonly CatalogPlan[];
};

const usd = (dollars: number) => BigInt(Math.round(dollars * 1_000_000));
const zero = BigInt(0);
const verified = "2026-07-10";

export const TOOL_CATALOG: readonly CatalogTool[] = [
  {
    key: "chatgpt-codex",
    name: "ChatGPT / Codex",
    shortName: "ChatGPT",
    provider: "openai",
    product: "codex",
    toolName: "codex",
    aliases: ["chatgpt", "codex"],
    sourceUrl: "https://chatgpt.com/pricing/",
    lastVerifiedAt: verified,
    plans: [
      { key: "free", name: "Free", tier: "Free", description: "For occasional personal use", prices: { monthly: zero }, includedCycleMicros: zero },
      { key: "go", name: "Go", tier: "Go", description: "Regional plan with local pricing", prices: {}, includedCycleMicros: zero, customPrice: true },
      { key: "plus", name: "Plus", tier: "Plus", description: "Expanded ChatGPT and Codex access", prices: { monthly: usd(20) }, includedCycleMicros: zero },
      { key: "pro", name: "Pro", tier: "Pro", description: "Highest individual access limits", prices: { monthly: usd(200) }, includedCycleMicros: zero },
      { key: "business", name: "Business", tier: "Business", description: "Secure workspace for growing teams", prices: { monthly: usd(25), annual: usd(20) }, includedCycleMicros: zero, minimumSeats: 2 },
      { key: "enterprise", name: "Enterprise", tier: "Enterprise", description: "Enterprise controls and negotiated pricing", prices: {}, includedCycleMicros: zero, customPrice: true },
    ],
  },
  {
    key: "claude",
    name: "Claude",
    shortName: "Claude",
    provider: "anthropic",
    product: "claude",
    toolName: "claude",
    aliases: ["claude", "claude-code"],
    sourceUrl: "https://claude.com/pricing",
    lastVerifiedAt: verified,
    plans: [
      { key: "free", name: "Free", tier: "Free", description: "Try Claude on web, mobile, and desktop", prices: { monthly: zero }, includedCycleMicros: zero },
      { key: "pro", name: "Pro", tier: "Pro", description: "More usage and Claude Code access", prices: { monthly: usd(20), annual: usd(17) }, includedCycleMicros: zero },
      { key: "max-5x", name: "Max 5x", tier: "Max 5x", description: "Five times Pro usage", prices: { monthly: usd(100) }, includedCycleMicros: zero },
      { key: "max-20x", name: "Max 20x", tier: "Max 20x", description: "Twenty times Pro usage", prices: { monthly: usd(200) }, includedCycleMicros: zero },
      { key: "team-standard", name: "Team Standard", tier: "Team", description: "Team collaboration and admin controls", prices: { monthly: usd(25), annual: usd(20) }, includedCycleMicros: zero },
      { key: "team-premium", name: "Team Premium", tier: "Team Premium", description: "Higher limits for intensive team use", prices: { monthly: usd(125), annual: usd(100) }, includedCycleMicros: zero },
      { key: "enterprise", name: "Enterprise", tier: "Enterprise", description: "Seat access plus usage or negotiated pricing", prices: { monthly: usd(20) }, includedCycleMicros: zero, customPrice: true },
    ],
  },
  {
    key: "cursor",
    name: "Cursor",
    shortName: "Cursor",
    provider: "cursor",
    product: "cursor",
    toolName: "cursor",
    aliases: ["cursor"],
    sourceUrl: "https://cursor.com/pricing",
    lastVerifiedAt: verified,
    plans: [
      { key: "hobby", name: "Hobby", tier: "Hobby", description: "Limited agent requests and completions", prices: { monthly: zero }, includedCycleMicros: zero },
      { key: "pro", name: "Pro", tier: "Pro", description: "Individual plan with expanded agent use", prices: { monthly: usd(20), annual: usd(16) }, includedCycleMicros: usd(20) },
      { key: "pro-plus", name: "Pro+", tier: "Pro+", description: "Three times usage on OpenAI, Claude, and Gemini", prices: { monthly: usd(60) }, includedCycleMicros: usd(70) },
      { key: "ultra", name: "Ultra", tier: "Ultra", description: "Maximum individual usage", prices: { monthly: usd(200) }, includedCycleMicros: usd(400) },
      { key: "teams", name: "Teams", tier: "Teams", description: "Centralized billing and team controls", prices: { monthly: usd(40), annual: usd(32) }, includedCycleMicros: usd(20) },
      { key: "enterprise", name: "Enterprise", tier: "Enterprise", description: "Enterprise security and negotiated pricing", prices: {}, includedCycleMicros: zero, customPrice: true },
    ],
  },
  {
    key: "github-copilot",
    name: "GitHub Copilot",
    shortName: "Copilot",
    provider: "github",
    product: "copilot",
    toolName: "copilot",
    aliases: ["copilot", "github-copilot"],
    sourceUrl: "https://docs.github.com/en/copilot/get-started/plans",
    lastVerifiedAt: verified,
    plans: [
      { key: "free", name: "Free", tier: "Free", description: "Limited completions and premium requests", prices: { monthly: zero }, includedCycleMicros: zero },
      { key: "student", name: "Student", tier: "Student", description: "Complimentary access for verified students", prices: { monthly: zero }, includedCycleMicros: zero },
      { key: "pro", name: "Pro", tier: "Pro", description: "Individual coding agent and 15 AI credits", prices: { monthly: usd(10) }, includedCycleMicros: usd(15) },
      { key: "pro-plus", name: "Pro+", tier: "Pro+", description: "Expanded models and 70 AI credits", prices: { monthly: usd(39) }, includedCycleMicros: usd(70) },
      { key: "max", name: "Max", tier: "Max", description: "Maximum individual access and 200 AI credits", prices: { monthly: usd(100) }, includedCycleMicros: usd(200) },
      { key: "business", name: "Business", tier: "Business", description: "Organization policy and management", prices: { monthly: usd(19) }, includedCycleMicros: zero },
      { key: "enterprise", name: "Enterprise", tier: "Enterprise", description: "GitHub Enterprise integration and controls", prices: { monthly: usd(39) }, includedCycleMicros: zero },
    ],
  },
];

export function findCatalogTool(key: string) {
  return TOOL_CATALOG.find((tool) => tool.key === key);
}

export function findCatalogPlan(toolKey: string, planKey: string) {
  return findCatalogTool(toolKey)?.plans.find((plan) => plan.key === planKey);
}

export function canonicalToolKey(toolName: string) {
  const normalized = toolName.trim().toLowerCase();
  return TOOL_CATALOG.find((tool) => tool.aliases.includes(normalized))?.key ?? normalized;
}

/** Human-readable tool label for UI (catalog short name or capitalized key). */
export function toolDisplayName(toolKeyOrName: string | null | undefined) {
  const key = canonicalToolKey(toolKeyOrName ?? "");
  const tool = findCatalogTool(key);
  if (tool?.shortName) return tool.shortName;
  if (!key) return "Tool";
  return key.charAt(0).toUpperCase() + key.slice(1);
}

export function toolUsageNames(toolKeyOrName: string | null | undefined) {
  const normalized = toolKeyOrName?.trim().toLowerCase();
  if (!normalized) return [];
  const tool = findCatalogTool(normalized) ?? findCatalogTool(canonicalToolKey(normalized));
  if (!tool) return [normalized];
  return [...new Set([tool.key, tool.toolName, ...tool.aliases])];
}

export function catalogPrice(plan: CatalogPlan, cadence: BillingCadence) {
  const price = plan.prices[cadence];
  if (price === undefined) return undefined;
  return cadence === "annual" ? price * BigInt(12) : price;
}

/** True when the tool is a known AI coding subscription in the catalog. */
export function isCodingTool(toolKeyOrName: string | null | undefined) {
  if (!toolKeyOrName) return false;
  const key = canonicalToolKey(toolKeyOrName);
  return TOOL_CATALOG.some((tool) => tool.key === key);
}

export function serializeCatalog() {
  return TOOL_CATALOG.map((tool) => ({
    ...tool,
    plans: tool.plans.map((plan) => ({
      ...plan,
      prices: Object.fromEntries(Object.entries(plan.prices).map(([cadence, price]) => [cadence, price?.toString()])),
      includedCycleMicros: plan.includedCycleMicros.toString(),
    })),
  }));
}
