import { ArrowRight, Check, Github, LockKeyhole, Server, ShieldCheck } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { HeroSection } from "@/components/public/hero-section";
import { ProductWalkthrough } from "@/components/public/product-walkthrough";
import { ToolLogosStrip } from "@/components/public/tool-logos-strip";
import { BrandLogo } from "@/components/brand-logo";
import { siteConfig } from "@/lib/public/config";
import { buildJsonLd } from "@/lib/public/json-ld";
import { cn } from "@/lib/utils";

const sectionTitleClass =
  "mt-4 text-3xl font-semibold tracking-tight md:text-4xl lg:text-[2.5rem] lg:leading-[1.1]";

const capabilities = [
  {
    title: "Adoption and coverage",
    description: "Know which developers, devices, tools, and local runtimes are active across the organization.",
    signal: "24 active developers · 31/33 devices online",
  },
  {
    title: "Spend and performance",
    description: "Attribute requests, tokens, estimated cost, latency, and failures by model, tool, and person.",
    signal: "$284.50 / 24h · 1.2s average latency",
  },
  {
    title: "Configuration health",
    description: "Surface stale agents, missing auth, quota pressure, personal keys, and configuration drift.",
    signal: "3 personal keys detected · 0.8% error rate",
  },
] as const;

const faqs = [
  ["What data does UseJunction collect?", "The agent and gateway record metadata such as tool, model, tokens, latency, estimated cost, device, and status. Prompts and responses are not stored by default."],
  ["Can we self-host it?", "Yes. UseJunction is open source and designed for infrastructure your team controls. Deploy the admin app and supporting services with the repository’s Docker or local setup."],
  ["Which tools are supported?", "The current MVP tracks Codex, Claude Code, Cursor, Continue, Cline, Roo Code, Copilot, Ollama, LM Studio, and related local runtimes."],
  ["Is Team available today?", "Community is available now. Team workflows and Enterprise capabilities are clearly marked as coming soon while the observability foundation is built."],
] as const;

const plans = [
  {
    name: "Community",
    label: "Available now",
    price: "$0",
    description: "The self-hosted foundation for teams that need visibility first.",
    cta: "Sign up free",
    href: siteConfig.signupUrl,
    featured: true,
    features: ["MIT-licensed and self-hosted", "Organization dashboard", "Usage, cost, and request visibility", "Device and configuration health"],
  },
  {
    name: "Team",
    label: "Coming soon",
    price: "Soon",
    description: "Shared workflows and controls for growing platform teams.",
    cta: "Join Team waitlist",
    href: `${siteConfig.signupUrl}?intent=team`,
    featured: false,
    features: ["Everything in Community", "Shared team workflows", "Extended reporting and retention", "Planned team controls"],
  },
  {
    name: "Enterprise",
    label: "Talk to us",
    price: "Custom",
    description: "A deployment conversation for organizations with specific requirements.",
    cta: "Contact us",
    href: "/contact?intent=enterprise",
    featured: false,
    features: ["Deployment planning", "Custom retention discussion", "Planned SSO and SAML", "Priority support discussion"],
  },
] as const;

export function UseJunctionHomeContent() {
  const jsonLd = buildJsonLd();

  return (
    <main>
      {jsonLd.map((data, index) => (
        <script key={index} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />
      ))}

      <HeroSection />

      <ToolLogosStrip />

      <section id="features" className="scroll-mt-20 border-b border-border py-24 lg:py-32">
        <div className="mx-auto w-full max-w-7xl px-5 lg:px-8">
          <div className="max-w-3xl">
            <p className="font-mono text-xs uppercase tracking-[0.16em] text-primary">The product</p>
            <h2 className={sectionTitleClass}>AI coding became infrastructure before anyone owned it.</h2>
            <p className="mt-5 text-base leading-7 text-muted-foreground md:text-lg md:leading-8">UseJunction gives platform and engineering teams the operational context to make decisions without changing how developers work.</p>
          </div>
          <div className="mt-12 grid border-y border-border md:grid-cols-3">
            {capabilities.map((capability, index) => (
              <div key={capability.title} className="border-b p-6 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0 lg:p-8">
                <span className="font-mono text-xs text-muted-foreground">0{index + 1}</span>
                <h3 className="mt-6 text-lg font-semibold md:text-xl">{capability.title}</h3>
                <p className="mt-3 leading-7 text-muted-foreground">{capability.description}</p>
                <p className="mt-8 border-t pt-4 font-mono text-xs text-primary">{capability.signal}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-border bg-muted py-24 lg:py-32">
        <div className="mx-auto w-full max-w-7xl px-5 lg:px-8">
          <div className="mb-10 max-w-2xl">
            <p className="font-mono text-xs uppercase tracking-[0.16em] text-primary">A closer look</p>
            <h2 className={sectionTitleClass}>Make model decisions based on evidence.</h2>
            <p className="mt-5 text-base leading-7 text-muted-foreground md:text-lg md:leading-8">Move from “we think the team uses…” to a shared operating picture of tools, models, cost, health, and coverage.</p>
          </div>
          <ProductWalkthrough />
        </div>
      </section>

      <section id="how-it-works" className="scroll-mt-20 border-b border-border py-24 lg:py-32">
        <div className="mx-auto w-full max-w-7xl px-5 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-[0.7fr_1.3fr]">
            <div><p className="font-mono text-xs uppercase tracking-[0.16em] text-primary">How it works</p><h2 className={sectionTitleClass}>Visibility without a workflow rewrite.</h2></div>
            <div className="border-t border-border">
              {["Create your organization account.", "Deploy the self-hosted admin and gateway.", "Enroll devices and supported tools.", "Inspect usage, cost, health, and configuration."].map((step, index) => (
                <div key={step} className="grid gap-4 border-b py-6 sm:grid-cols-[4rem_1fr] sm:gap-8"><span className="font-mono text-sm text-primary">0{index + 1}</span><div><h3 className="text-lg font-medium">{step}</h3><p className="mt-2 max-w-xl text-sm leading-7 text-muted-foreground md:text-base">{["Start with a Community organization and invite the people who need visibility.", "Run the control plane on infrastructure your team controls.", "The lightweight agent reports metadata and leaves the developer workflow intact.", "Use one operational surface before introducing shared keys, policy, or routing."][index]}</p></div></div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-border bg-brand-yellow/40 py-20 lg:py-24">
        <div className="mx-auto grid w-full max-w-7xl gap-10 px-5 lg:grid-cols-[0.8fr_1.2fr] lg:items-center lg:px-8">
          <div><p className="font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground">Open source / self-hosted</p><h2 className={sectionTitleClass}>Your data stays close to your team.</h2></div>
          <div className="grid gap-4 sm:grid-cols-3">
            {[[Server, "Run it where your data lives"], [LockKeyhole, "Metadata-only by default"], [ShieldCheck, "Audit the code yourself"]].map(([Icon, text]) => <div key={text as string} className="border border-foreground/20 bg-background/60 p-5"><Icon className="size-5" /><p className="mt-8 text-sm leading-6">{text as string}</p></div>)}
          </div>
        </div>
      </section>

      <section id="pricing" className="scroll-mt-20 border-b border-border py-24 lg:py-32">
        <div className="mx-auto w-full max-w-7xl px-5 lg:px-8">
          <div className="max-w-2xl">
            <p className="font-mono text-xs uppercase tracking-[0.16em] text-primary">Pricing</p>
            <h2 className={sectionTitleClass}>Start with visibility. Grow into control.</h2>
            <p className="mt-5 text-base leading-7 text-muted-foreground md:text-lg md:leading-8">
              Community is available now. Future plans are shown honestly, with no checkout or hidden feature claims.
            </p>
          </div>
          <div className="mt-12 grid border border-border lg:grid-cols-3">
            {plans.map((plan) => (
              <Card
                key={plan.name}
                className={cn(
                  "border-0 border-b p-0 shadow-none last:border-b-0 lg:border-b-0 lg:border-r lg:last:border-r-0",
                  plan.featured ? "bg-primary text-primary-foreground" : "bg-card text-card-foreground"
                )}
              >
                <CardHeader className="border-b p-6 lg:p-7">
                  <div className="flex items-center justify-between gap-4">
                    <CardTitle className="text-lg">{plan.name}</CardTitle>
                    <Badge
                      variant={plan.featured ? "secondary" : "outline"}
                      className={plan.featured ? "border-transparent bg-primary-foreground text-primary" : undefined}
                    >
                      {plan.label}
                    </Badge>
                  </div>
                  <p className={cn("mt-3 text-sm leading-6", plan.featured ? "text-primary-foreground/80" : "text-muted-foreground")}>
                    {plan.description}
                  </p>
                  <div className="mt-6 font-mono text-2xl">{plan.price}</div>
                </CardHeader>
                <CardContent className="p-6 lg:p-7">
                  <ul className="space-y-2.5">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex gap-3 text-sm">
                        <Check className="mt-0.5 size-4 shrink-0" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                </CardContent>
                <CardFooter className="p-6 pt-0 lg:p-7 lg:pt-0">
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full",
                      plan.featured
                        ? "border-primary-foreground/25 bg-primary-foreground text-primary hover:bg-primary-foreground/90 hover:text-primary"
                        : "bg-background text-foreground hover:bg-muted"
                    )}
                    asChild
                  >
                    <a href={plan.href}>
                      {plan.cta}
                      <ArrowRight />
                    </a>
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section id="faq" className="scroll-mt-20 border-b border-border py-24 lg:py-32">
        <div className="mx-auto grid w-full max-w-7xl gap-12 px-5 lg:grid-cols-[0.7fr_1.3fr] lg:px-8"><div><p className="font-mono text-xs uppercase tracking-[0.16em] text-primary">FAQ</p><h2 className={sectionTitleClass}>The short version.</h2></div><Accordion type="single" collapsible>{faqs.map(([question, answer], index) => <AccordionItem key={question} value={`faq-${index}`}><AccordionTrigger className="text-left text-base md:text-lg">{question}</AccordionTrigger><AccordionContent className="max-w-2xl text-sm leading-7 text-muted-foreground md:text-base">{answer}</AccordionContent></AccordionItem>)}</Accordion></div>
      </section>

      <section className="py-24 lg:py-32"><div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-5 lg:flex-row lg:items-end lg:justify-between lg:px-8"><div><p className="font-mono text-xs uppercase tracking-[0.16em] text-primary">Ready when you are</p><h2 className={cn(sectionTitleClass, "max-w-3xl")}>See what your team uses before you try to control it.</h2></div><Button asChild><a href={siteConfig.signupUrl}>Create your organization <ArrowRight /></a></Button></div></section>

      <footer className="border-t border-border bg-card"><div className="mx-auto grid w-full max-w-7xl gap-10 px-5 py-14 lg:grid-cols-[1fr_2fr] lg:px-8"><div><BrandLogo className="h-9" /><p className="mt-3 max-w-xs text-sm leading-6 text-muted-foreground">{siteConfig.tagline}. Self-hosted, open source, and built for teams that want context before control.</p></div><div className="grid gap-8 sm:grid-cols-3"><div><p className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">Product</p><div className="mt-4 grid gap-3 text-sm"><a href="#features" className="w-fit text-left hover:text-primary">Overview</a><a href="#pricing" className="w-fit text-left hover:text-primary">Pricing</a><a href={siteConfig.docsUrl} target="_blank" rel="noopener noreferrer" className="w-fit hover:text-primary">Documentation</a></div></div><div><p className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">Community</p><div className="mt-4 grid gap-3 text-sm"><a href={siteConfig.githubUrl} target="_blank" rel="noopener noreferrer" className="flex w-fit items-center gap-2 hover:text-primary"><Github className="size-4" />GitHub</a><a href={`${siteConfig.githubUrl}/discussions`} target="_blank" rel="noopener noreferrer" className="w-fit hover:text-primary">Discussions</a><a href={`${siteConfig.githubUrl}/issues`} target="_blank" rel="noopener noreferrer" className="w-fit hover:text-primary">Issues</a></div></div><div><p className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">License</p><div className="mt-4 grid gap-3 text-sm"><a href={`${siteConfig.githubUrl}/blob/main/LICENSE`} target="_blank" rel="noopener noreferrer" className="w-fit hover:text-primary">MIT license</a><a href="/login" className="w-fit hover:text-primary">Sign in</a><a href={siteConfig.signupUrl} className="w-fit hover:text-primary">Sign up</a></div></div></div></div><div className="mx-auto w-full max-w-7xl border-t border-border px-5 py-5 font-mono text-xs text-muted-foreground lg:px-8">© {new Date().getFullYear()} {siteConfig.name}. All rights reserved.</div></footer>
    </main>
  );
}
