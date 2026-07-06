/**
 * Centralized site config — replace placeholders here when assets/links are finalized.
 */
export const siteConfig = {
  name: "UseJunction",
  tagline: "Open-source observability for AI coding tools",
  description:
    "Track usage, cost, latency, and device health across Cursor, Claude Code, Windsurf, and more — self-hosted and local-first.",
  githubUrl: "https://github.com/usejunction/usejunction",
  url: process.env.NEXTAUTH_URL ?? "https://usejunction.dev",
} as const;

export const navSections = [
  { id: "preview", label: "Preview" },
  { id: "capabilities", label: "Capabilities" },
  { id: "workflow", label: "How it works" },
  { id: "faq", label: "FAQ" },
] as const;

export const supportedTools = [
  { name: "Cursor", placeholder: "CR" },
  { name: "Claude Code", placeholder: "CC" },
  { name: "Windsurf", placeholder: "WS" },
  { name: "Cline", placeholder: "CL" },
  { name: "Continue", placeholder: "CO" },
  { name: "Aider", placeholder: "AI" },
] as const;

export const footerLinks = {
  product: [
    { label: "Documentation", href: "#" },
    { label: "GitHub", href: siteConfig.githubUrl },
    { label: "Changelog", href: "#" },
  ],
  legal: [
    { label: "Privacy", href: "#" },
    { label: "Terms", href: "#" },
  ],
} as const;

export const faqItems = [
  {
    question: "What data does UseJunction collect?",
    answer:
      "The agent captures request metadata — model, tokens, latency, cost estimates, and tool identity — not your source code. All data stays on infrastructure you control. No telemetry is sent to third-party analytics.",
  },
  {
    question: "Which AI coding tools are supported?",
    answer:
      "MVP targets Cursor, Claude Code, Windsurf, Cline, Continue, and Aider. The agent hooks into tool APIs and local proxies to observe usage without modifying your workflow.",
  },
  {
    question: "Can I self-host?",
    answer:
      "Yes. UseJunction is open-source and designed to run on your own servers or a single machine. Docker Compose and bare-metal setups are supported. You own the data and the deployment.",
  },
  {
    question: "What is in the MVP?",
    answer:
      "The MVP includes the local agent, admin dashboard, usage/cost tracking, device health monitoring, config health checks, and request logging. Billing, SSO, and multi-org support are planned post-MVP.",
  },
  {
    question: "What is not in the MVP?",
    answer:
      "Team billing, role-based access control, alerting integrations (PagerDuty, Slack), and hosted SaaS are not in the initial release. The focus is observability you can run yourself.",
  },
] as const;
