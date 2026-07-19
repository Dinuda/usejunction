import { ArrowRight, Check } from "lucide-react";
import Link from "next/link";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { HeroSection } from "@/components/public/hero-section";
import { HomeFeatureDeepDives } from "@/components/public/home-feature-deep-dives";
import { HomeTrustBand } from "@/components/public/home-trust-band";
import { ProductWalkthrough } from "@/components/public/product-walkthrough";
import { ToolLogosStrip } from "@/components/public/tool-logos-strip";
import { SiteFooter } from "@/components/public/site-footer";
import { PRICING_PLANS, siteConfig } from "@/lib/public/config";
import {
  USER_LIMIT_FREE,
  TEAM_PRICE_PER_DEV_USD,
  TRIAL_DAYS,
} from "@/lib/saas-billing/entitlements";
import { buildHomeJsonLd } from "@/lib/public/json-ld";
import { HOME_FAQS } from "@/lib/public/home-faqs";
import { cn } from "@/lib/utils";

const sectionTitleClass =
  "mt-4 text-3xl font-semibold tracking-tight md:text-4xl lg:text-[2.5rem] lg:leading-[1.1]";

const learnLinks = [
  {
    href: "/guides/see-plan-usage-and-waste",
    label: "Guide",
    title: "See plan usage and seat waste",
  },
  {
    href: "/guides/see-team-ai-coding-usage",
    label: "Guide",
    title: "Team AI coding insights",
  },
  {
    href: "/guides/open-source-wakatime-alternative-for-ai-coding",
    label: "Guide",
    title: "Open-source WakaTime alternative?",
  },
  {
    href: "/compare/wakatime",
    label: "Compare",
    title: "UseJunction vs WakaTime",
  },
  {
    href: "/for/cursor",
    label: "For teams",
    title: "Cursor usage for teams",
  },
] as const;

const plans = PRICING_PLANS.map((plan) => ({
  name: plan.name,
  label: plan.id === "community" ? "Free tier" : plan.id === "enterprise" ? "Talk to us" : null,
  price: plan.price,
  period: plan.id === "community" ? "forever" : plan.id === "enterprise" ? "annual agreement" : plan.period,
  description:
    plan.id === "community"
      ? "Self-hosted MIT or the free tier after your trial ends."
      : plan.id === "team"
        ? "Per-user billing and full observability for growing platform teams."
        : "A deployment conversation for organizations with specific requirements.",
  cta: plan.id === "enterprise" ? "Contact us" : plan.id === "team" ? "Get started" : "Sign up free",
  href: plan.id === "enterprise" ? "/contact?intent=enterprise" : plan.cta.href,
  featured: plan.featured,
  features:
    plan.id === "community"
      ? [`MIT-licensed and self-hosted`, `Up to ${USER_LIMIT_FREE} users`, "Usage, cost, and request visibility", "Device and configuration health"]
      : plan.id === "team"
        ? ["Everything in Community", "One connected device per user", "Per-developer cost attribution", "Latency, errors, and personal key detection"]
        : ["Deployment planning", "Custom retention discussion", "Planned SSO and SAML", "Priority support discussion"],
}));

export function UseJunctionHomeContent() {
  const jsonLd = buildHomeJsonLd();

  return (
    <main>
      {jsonLd.map((data, index) => (
        <script key={index} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />
      ))}

      <HeroSection />

      <ToolLogosStrip />

      <section id="product" className="scroll-mt-20 border-b border-border py-16 sm:py-20 lg:py-32">
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-5 lg:px-8">
          <div className="mb-12 max-w-3xl lg:mb-16">
            <p className="font-mono text-xs uppercase tracking-[0.16em] text-primary">The product</p>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight md:text-4xl lg:text-[2.5rem] lg:leading-[1.1]">
              Get ahead of your fastest-growing AI coding stack.
            </h2>
          </div>
          <ProductWalkthrough />
        </div>
      </section>

      <HomeTrustBand />

      <HomeFeatureDeepDives />

      <section className="border-b border-border bg-muted/50 py-16 sm:py-20 lg:py-32">
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-5 lg:px-8">
          <div className="max-w-2xl">
            <p className="font-mono text-xs uppercase tracking-[0.16em] text-primary">Learn</p>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight md:text-4xl lg:text-[2.5rem] lg:leading-[1.1]">
              Guides, comparisons, and playbooks for deliberate AI coding ops.
            </h2>
          </div>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {learnLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="home-soft-panel group flex flex-col p-6 transition-colors hover:border-primary"
              >
                <span className="font-mono text-[0.65rem] uppercase tracking-[0.14em] text-primary">
                  {link.label}
                </span>
                <h3 className="mt-4 text-lg font-semibold leading-snug group-hover:text-primary">
                  {link.title}
                </h3>
                <span className="mt-auto inline-flex items-center gap-1.5 pt-8 text-sm text-muted-foreground transition-colors group-hover:text-primary">
                  Continue reading
                  <ArrowRight className="size-3.5" />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="scroll-mt-20 border-b border-border py-16 sm:py-20 lg:py-32">
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-5 lg:px-8">
          <div className="max-w-2xl">
            <p className="font-mono text-xs uppercase tracking-[0.16em] text-primary">Pricing</p>
            <h2 className={sectionTitleClass}>Start with visibility. Grow into control.</h2>
            <p className="mt-5 text-base leading-7 text-muted-foreground md:text-lg md:leading-8">
              Start free, then upgrade to Team as your team grows.
            </p>
          </div>
          <div className="mt-12 grid gap-6 lg:grid-cols-3 lg:items-center">
            {plans.map((plan) => (
              <article
                key={plan.name}
                className={cn(
                  "relative flex flex-col overflow-hidden rounded-none border",
                  plan.featured
                    ? "border-primary bg-primary text-primary-foreground shadow-md lg:-my-5 lg:min-h-[30rem]"
                    : "border-border bg-card text-card-foreground",
                )}
              >
                <div className={cn("relative flex flex-1 flex-col", plan.featured ? "p-8 lg:p-10" : "p-6 lg:p-7")}>
                  <div className="flex items-start justify-between gap-4">
                    <h3 className="text-lg font-semibold tracking-tight">{plan.name}</h3>
                    {plan.label ? (
                      <Badge
                        variant="outline"
                        className="rounded-none border-border bg-background text-[0.65rem] uppercase tracking-[0.08em] text-muted-foreground"
                      >
                        {plan.label}
                      </Badge>
                    ) : null}
                  </div>
                  <p
                    className={cn(
                      "mt-3 text-sm leading-6",
                      plan.featured ? "text-primary-foreground/80" : "text-muted-foreground",
                    )}
                  >
                    {plan.description}
                  </p>
                  <div
                    className={cn(
                      "mt-6 border-b pb-6",
                      plan.featured ? "border-primary-foreground/20" : "border-border",
                    )}
                  >
                    <p className="font-mono text-3xl font-semibold tracking-tight">{plan.price}</p>
                    <p
                      className={cn(
                        "mt-1 text-xs uppercase tracking-[0.08em]",
                        plan.featured ? "text-primary-foreground/65" : "text-muted-foreground",
                      )}
                    >
                      {plan.period}
                    </p>
                  </div>
                  <ul className="mt-6 space-y-3">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex gap-3 text-sm leading-6">
                        <Check
                          className={cn(
                            "mt-0.5 size-4 shrink-0",
                            plan.featured ? "text-primary-foreground" : "text-primary",
                          )}
                        />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <div className={cn("mt-auto", plan.featured ? "pt-10" : "pt-8")}>
                    {plan.featured ? (
                      <a
                        href={plan.href}
                        className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-none bg-white px-4 text-sm font-semibold !text-primary transition-colors hover:bg-white/95 hover:!text-primary-dark [&_svg]:!text-primary"
                      >
                        <span className="!text-primary">{plan.cta}</span>
                        <ArrowRight className="size-4 shrink-0 !text-primary" />
                      </a>
                    ) : (
                      <Button
                        className="h-10 w-full rounded-none border-border bg-background font-semibold text-foreground hover:bg-muted"
                        variant="outline"
                        asChild
                      >
                        <a href={plan.href}>
                          {plan.cta}
                          <ArrowRight />
                        </a>
                      </Button>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
          <p className="mt-6 text-sm text-muted-foreground">
            Team is ${TEAM_PRICE_PER_DEV_USD}/active developer/month after a {TRIAL_DAYS}-day trial.
          </p>
        </div>
      </section>

      <section id="faq" className="scroll-mt-20 border-b border-border py-16 sm:py-20 lg:py-32">
        <div className="mx-auto grid w-full max-w-7xl gap-10 px-4 sm:px-5 lg:grid-cols-[0.7fr_1.3fr] lg:gap-12 lg:px-8">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.16em] text-primary">FAQ</p>
            <h2 className={sectionTitleClass}>The short version.</h2>
          </div>
          <Accordion type="single" collapsible>
            {HOME_FAQS.map((faq, index) => (
              <AccordionItem key={faq.question} value={`faq-${index}`}>
                <AccordionTrigger className="text-left text-base md:text-lg">{faq.question}</AccordionTrigger>
                <AccordionContent className="max-w-2xl text-sm leading-7 text-muted-foreground md:text-base">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      <section className="py-16 sm:py-20 lg:py-32">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 sm:px-5 lg:flex-row lg:items-end lg:justify-between lg:px-8">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.16em] text-primary">Ready when you are</p>
            <h2 className={cn(sectionTitleClass, "max-w-3xl")}>
              See what your team uses before you try to control it.
            </h2>
          </div>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <Link href={siteConfig.signupUrl} className="public-btn public-btn-primary w-full sm:w-auto">
              Get started
              <ArrowRight className="h-4 w-4" />
            </Link>
            <a
              href={siteConfig.docsUrl}
              className="public-btn public-btn-outline w-full sm:w-auto"
            >
              Deploy UseJunction
            </a>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
