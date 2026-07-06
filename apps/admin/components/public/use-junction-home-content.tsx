import { Github } from "lucide-react";
import { UjCta } from "@/components/blocks/uj-cta";
import { UjFeatures } from "@/components/blocks/uj-features";
import { UjFooter } from "@/components/blocks/uj-footer";
import { UjCard, UjCardGrid, UjSection } from "@/components/blocks/uj-section";
import { HeroSection } from "@/components/public/hero-section";
import { HowItWorksSequence } from "@/components/public/how-it-works-sequence";
import { PricingSection } from "@/components/public/pricing-section";
import { SmartRoutingShowcase } from "@/components/public/smart-routing-showcase";
import { ToolLogosStrip } from "@/components/public/tool-logos-strip";
import {
  FOOTER_COLUMNS,
  OBSERVABILITY_FEATURES,
  ROADMAP_ITEMS,
  siteConfig,
} from "@/lib/public/config";
import { buildJsonLd } from "@/lib/public/json-ld";

export function UseJunctionHomeContent() {
  const jsonLd = buildJsonLd();

  const footerColumns = [
    { title: "Product", links: [...FOOTER_COLUMNS.product] },
    { title: "Docs", links: [...FOOTER_COLUMNS.docs] },
    { title: "Community", links: [...FOOTER_COLUMNS.community] },
    { title: "License", links: [...FOOTER_COLUMNS.license] },
  ];

  return (
    <>
      {jsonLd.map((data, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
        />
      ))}

      <HeroSection />

      <ToolLogosStrip />

      <UjSection
        eyebrow="The problem"
        title="Your team already runs a dozen AI coding tools. Your organization cannot see any of it."
        narrow
        description={
          <p>
            Developers pick Cursor, Claude Code, Copilot, or local Ollama models on their own
            machines. Engineering leaders have no org-wide view of adoption, spend, latency, or
            misconfiguration. Finance sees surprise invoices. Security cannot tell personal keys
            from company keys.
          </p>
        }
      />

      <UjFeatures
        id="features"
        label="What you can see"
        heading="Observability answers for engineering, finance, and security"
        description="The MVP delivers the foundation: who uses what, what it costs, how it performs, and whether devices are configured correctly."
        features={OBSERVABILITY_FEATURES}
      />

      <UjSection
        id="how-it-works"
        eyebrow="How it works"
        title="Four steps to org-wide visibility"
        description={
          <p className="max-w-2xl text-base">
            Observation requires no change to the developer&apos;s workflow. Install, enroll,
            configure, see.
          </p>
        }
      >
        <HowItWorksSequence />
      </UjSection>

      <section className="public-section">
        <div className="container">
          <div
            className="grid gap-8 border p-8 lg:grid-cols-3 lg:items-center lg:p-12"
            style={{ borderColor: "var(--public-border)", background: "var(--public-surface)" }}
          >
            <div className="lg:col-span-1">
              <p className="public-eyebrow mb-3">Open source</p>
              <h2 className="text-2xl font-bold tracking-tight">
                Your data never leaves your infrastructure
              </h2>
            </div>
            <div className="space-y-4 text-muted-foreground lg:col-span-2">
              <p>
                UseJunction is open source under the {siteConfig.license} license. Self-host on a
                single machine, Docker Compose, or your own cloud — no vendor SaaS holding your
                usage data.
              </p>
              <div className="flex flex-wrap items-center gap-4">
                <a
                  href={siteConfig.githubUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="public-btn public-btn-outline text-sm public-mono"
                >
                  <Github className="h-4 w-4" />
                  Star on GitHub
                </a>
                <span className="text-sm public-mono">{siteConfig.license} · Self-hostable</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <PricingSection />

      <UjSection
        id="roadmap"
        eyebrow="Where this is going"
        title="Visibility today. Control next."
        description={
          <p className="max-w-2xl text-base">
            Once your organization can see AI coding usage, UseJunction becomes the layer where
            teams introduce team API keys, adopt local models, and eventually add routing, policy,
            and cost optimization.{" "}
            <strong className="font-medium text-foreground">
              Roadmap — not available today.
            </strong>
          </p>
        }
      >
        <SmartRoutingShowcase />

        <UjCardGrid columns={3}>
          {ROADMAP_ITEMS.filter((item) => item.title !== "Smart routing").map((item) => (
            <UjCard key={item.title}>
              <span className="text-xs public-mono text-muted-foreground">Roadmap</span>
              <h3 className="mt-2 font-semibold">{item.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{item.description}</p>
            </UjCard>
          ))}
        </UjCardGrid>
      </UjSection>

      <UjCta
        heading="Start with visibility. Grow into control."
        description="Deploy the open-source admin app, roll out the agent, and see what your team actually uses."
        primary={{ text: "Deploy UseJunction", url: siteConfig.docsUrl }}
        secondary={{ text: "Star on GitHub", url: siteConfig.githubUrl }}
      />

      <UjFooter
        name={siteConfig.name}
        tagline={siteConfig.tagline}
        columns={footerColumns}
        copyright={`© ${new Date().getFullYear()} ${siteConfig.name}. All rights reserved.`}
      />
    </>
  );
}
