export const siteConfig = {
  name: "UseJunction",
  tagline: "Open-source observability for AI coding tools",
  description:
    "See every AI coding tool your team uses — which models, what it costs, how it performs, and whether devices are configured correctly. Self-hosted. Open source. Observe first; control when you're ready.",
  url: process.env.NEXTAUTH_URL ?? "https://usejunction.dev",
  githubUrl: "https://github.com/usejunction/usejunction",
  docsUrl: "https://github.com/usejunction/usejunction#readme",
  license: "MIT",
} as const;

export const navAnchors = [
  { id: "how-it-works", label: "How it works" },
  { id: "features", label: "Features" },
  { id: "pricing", label: "Pricing" },
] as const;

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
    metric: "31/33 online",
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
    description: "Perfect for side projects and small teams",
    price: "$0",
    period: "per month",
    cta: { label: "Get Started", href: siteConfig.docsUrl },
    featured: false,
    features: [
      "Self-hosted MIT license",
      "Up to 25 enrolled devices",
      "Usage & cost dashboard",
      "Tool & model visibility",
      "Community support on GitHub",
    ],
    premiumFeatures: [],
  },
  {
    id: "team",
    name: "Team",
    description: "For growing teams that need more power",
    price: "$0",
    period: "per month",
    cta: { label: "Get Started", href: siteConfig.docsUrl },
    featured: true,
    badge: "Popular",
    features: [
      "Everything in Community",
      "Unlimited enrolled devices",
      "Per-developer cost attribution",
      "Latency & error rate metrics",
      "Personal key detection",
      "Device configuration health",
    ],
    premiumFeatures: [
      "Team API keys (roadmap)",
      "Multi-team rollup (roadmap)",
      "Policy controls (roadmap)",
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    description: "For organizations that need full control",
    price: "Custom",
    period: "contact us",
    cta: { label: "Contact Sales", href: `${siteConfig.githubUrl}/issues` },
    featured: false,
    features: [
      "Everything in Team",
      "Dedicated onboarding",
      "Custom retention policies",
      "Deployment assistance",
      "Priority support channel",
    ],
    premiumFeatures: [
      "SSO & SAML (roadmap)",
      "Audit log export",
      "SLA guarantee",
    ],
  },
] as const;

export const TRUST_FEATURES = [
  {
    title: "Open source under MIT",
    description: "Audit the code, fork it, and run it on infrastructure you control. No black-box telemetry.",
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
    { label: "Dashboard", href: "/login" },
    { label: "Changelog", href: "#" },
  ],
  docs: [
    { label: "Documentation", href: siteConfig.docsUrl },
    { label: "Self-host guide", href: siteConfig.docsUrl },
    { label: "API reference", href: "#" },
  ],
  community: [
    { label: "GitHub", href: siteConfig.githubUrl },
    { label: "Discussions", href: `${siteConfig.githubUrl}/discussions` },
    { label: "Issues", href: `${siteConfig.githubUrl}/issues` },
  ],
  license: [
    { label: siteConfig.license, href: `${siteConfig.githubUrl}/blob/main/LICENSE` },
    { label: "Privacy", href: "#" },
    { label: "Terms", href: "#" },
  ],
} as const;
