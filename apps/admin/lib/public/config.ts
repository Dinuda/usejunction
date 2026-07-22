import {
  USER_LIMIT_FREE,
  TEAM_PRICE_PER_DEV_USD,
} from "@/lib/saas-billing/entitlements";

export const siteConfig = {
  name: "UseJunction",
  tagline: "Open-source AI coding observability for teams",
  /** Secondary promise for SEO / AEO (plan usage + team insights) */
  promise:
    "See AI coding tool usage, plan utilization, and team insights—before you try to control it.",
  description:
    "Open-source AI coding observability for teams. Track Cursor, Claude Code, and Copilot usage, cost, plan seat waste, and device health. Self-hosted.",
  seoTitle: "UseJunction — AI Coding Observability for Teams",
  url: process.env.NEXTAUTH_URL ?? "https://usejunction.dev",
  githubUrl: "https://github.com/Dinuda/usejunction",
  docsUrl: "https://github.com/Dinuda/usejunction#readme",
  changelogUrl: "https://github.com/Dinuda/usejunction/releases",
  signupUrl: "/signup",
  license: "UseJunction Community License",
  /** X/Twitter handle (with @). Override via NEXT_PUBLIC_TWITTER_HANDLE. */
  twitterHandle: process.env.NEXT_PUBLIC_TWITTER_HANDLE ?? "@usejunction",
} as const;

/** X/Twitter profile URL derived from the handle, for sameAs. */
export const twitterUrl = `https://x.com/${siteConfig.twitterHandle.replace(/^@/, "")}`;

export const navAnchors = [{ id: "pricing", label: "Pricing" }] as const;

/** Primary page links (product lines, guides, etc.). */
export const navLinks: ReadonlyArray<{ href: string; label: string }> = [
  { href: "/", label: "For Coders" },
  { href: "/blog", label: "Blog" },
];

export const SUPPORTED_TOOLS = [
  { name: "Codex", initials: "CX" },
  { name: "Claude Code", initials: "CC" },
  { name: "Cursor", initials: "CR" },
  { name: "Continue", initials: "CO" },
  { name: "Cline", initials: "CL" },
  { name: "Roo Code", initials: "RC" },
  { name: "OpenCode", initials: "OC" },
  { name: "GitHub Copilot", initials: "GH" },
  { name: "Ollama", initials: "OL" },
  { name: "LM Studio", initials: "LM" },
] as const;

export const OBSERVABILITY_FEATURES = [
  {
    title: "Who is using AI coding tools",
    description: "Per-developer adoption across your org — active users, last seen, and coverage gaps.",
    metric: "24 active devs",
    icon: "fi-rr-users",
  },
  {
    title: "Which tools & models",
    description: "Tool installations and model calls broken down by user, team, and device.",
    metric: "8 tools tracked",
    icon: "fi-rr-layers",
  },
  {
    title: "Cost by user / tool / model",
    description: "Estimated spend attribution so finance and eng leads see where money goes.",
    metric: "$284.50 / 24h",
    icon: "fi-rr-dollar",
  },
  {
    title: "Latency & failure rate",
    description: "Per-model response times and error rates to spot degraded providers early.",
    metric: "1.2s avg · 0.8% err",
    icon: "fi-rr-pulse",
  },
  {
    title: "Device configuration health",
    description: "Agent heartbeats, config drift, and unhealthy device flags in one view.",
    metric: "33 enrolled",
    icon: "fi-rr-laptop-mobile",
  },
  {
    title: "Personal vs company keys",
    description: "Detect when developers use personal API keys instead of org-provisioned ones.",
    metric: "3 personal keys",
    icon: "fi-rr-key",
  },
  {
    title: "Local models on devices",
    description: "See which developers run Ollama, LM Studio, or other local inference.",
    metric: "12 local runtimes",
    icon: "fi-rr-microchip",
  },
  {
    title: "Request activity log",
    description: "Inspect individual requests with model, tokens, latency, and status.",
    metric: "12,847 req / 24h",
    icon: "fi-rr-list",
  },
] as const;

export const ROADMAP_ITEMS = [
  {
    title: "Team API keys",
    description: "Introduce org-provisioned keys once usage data shows where personal keys hide.",
  },
  {
    title: "Local & self-hosted models",
    description: "Help teams adopt Ollama and open-weight models with visibility into local usage.",
  },
  {
    title: "Smart routing",
    description: "Route requests to the right model based on cost, latency, and policy — when you're ready.",
  },
  {
    title: "Policy & cost optimization",
    description: "Enforce budgets and model policies on top of the observability foundation you already trust.",
  },
] as const;

export const PROCESS_STEPS = [
  {
    title: "Install the admin app",
    description:
      "Deploy the self-hostable UseJunction admin on your infrastructure — Docker Compose, a single VM, or your existing cluster.",
  },
  {
    title: "Roll out the local agent",
    description:
      "Developers enroll devices with a single token. The lightweight agent runs locally and reports metadata — no workflow changes.",
  },
  {
    title: "Configure supported tools",
    description:
      "Point Cursor, Claude Code, Continue, and other supported tools at the agent. Observation only — no traffic interception.",
  },
  {
    title: "See usage in the dashboard",
    description:
      "Cost, models, latency, device health, and key usage appear in one org-wide view. Visibility before control.",
  },
] as const;

export const PRICING_PLANS = [
  {
    id: "community",
    name: "Community",
    description: "",
    price: "Free",
    period: `up to ${USER_LIMIT_FREE} seats`,
    cta: { label: "Get Started", href: siteConfig.signupUrl },
    featured: false,
    features: [
      "Community License self-host",
      `${USER_LIMIT_FREE} seats free`,
      "Usage & cost dashboard",
      "Tool & model visibility",
      "GitHub community support",
    ],
    premiumFeatures: [] as const,
  },
  {
    id: "team",
    name: "Managed",
    description: "Hosted by us",
    price: `$${TEAM_PRICE_PER_DEV_USD}`,
    period: "per active developer / month",
    cta: { label: "Get Started", href: siteConfig.signupUrl },
    featured: true,
    badge: "Popular",
    features: [
      "Hosted control plane",
      "Multiple devices per developer",
      "Per-developer cost attribution",
      "Latency & error metrics",
      "Personal key detection",
      "Reporting with guided insights",
    ],
    premiumFeatures: [
      "Advanced Signals & work sessions",
      "Device health",
      "Multi-team rollup",
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    description: "Full control",
    price: "Custom",
    period: "contact us",
    cta: { label: "Talk to us", href: "/contact?intent=enterprise" },
    featured: false,
    features: [
      "Everything in Managed",
      "Dedicated onboarding",
      "Custom retention policies",
      "Deployment assistance",
      "Priority support",
    ],
    premiumFeatures: [
      "SSO & SAML",
      "Audit logs",
      "SLA guarantee",
    ],
  },
] as const;

export const TRUST_FEATURES = [
  {
    title: "Open source under Community License",
    description: "Audit the code and run it on infrastructure you control. No black-box telemetry.",
  },
  {
    title: "Your data stays local",
    description: "Request metadata flows to your self-hosted admin — not a third-party analytics vendor.",
  },
  {
    title: "No surveillance posture",
    description: "UseJunction does not intercept network traffic, capture browser activity, or enforce MDM.",
  },
] as const;

export const FOOTER_COLUMNS = {
  product: [
    { label: "Overview", href: "/" },
    { label: "Pricing", href: "/#pricing" },
    { label: "Blog", href: "/blog" },
    { label: "Changelog", href: siteConfig.changelogUrl },
    { label: "Contact", href: "/contact" },
  ],
  community: [
    { label: "GitHub", href: siteConfig.githubUrl },
    { label: "Discussions", href: `${siteConfig.githubUrl}/discussions` },
    { label: "Issues", href: `${siteConfig.githubUrl}/issues` },
  ],
  license: [
    { label: siteConfig.license, href: `${siteConfig.githubUrl}/blob/main/LICENSE` },
    { label: "Privacy", href: "/privacy" },
    { label: "Terms", href: "/terms" },
    { label: "llms.txt", href: "/llms.txt" },
  ],
} as const;
