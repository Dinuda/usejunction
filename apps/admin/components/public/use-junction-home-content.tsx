"use client";

import { ArrowRight, Check, Plus } from "lucide-react";
import Link from "next/link";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { HeroSection } from "@/components/public/hero-section";
import { HomeWorldClass } from "@/components/public/home-world-class";
import { ToolLogosStrip } from "@/components/public/tool-logos-strip";
import { CalendlyTalkButton } from "@/components/public/calendly-talk-button";
import { SiteFooter } from "@/components/public/site-footer";
import { PRICING_PLANS } from "@/lib/public/config";
import { buildHomeJsonLd } from "@/lib/public/json-ld";
import { HOME_FAQS } from "@/lib/public/home-faqs";
import { cn } from "@/lib/utils";

export function UseJunctionHomeContent() {
  const jsonLd = buildHomeJsonLd();

  return (
    <main>
      {jsonLd.map((data, index) => (
        <script key={index} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />
      ))}

      <HeroSection />

      <ToolLogosStrip />

      <section className="border-y border-border bg-[#f7fbfc] py-16 sm:py-20" aria-labelledby="team-ai-spend-heading">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-10">
          <div className="max-w-3xl">
            <p className="font-mono text-xs uppercase tracking-[0.16em] text-[#08758a]">For engineering and platform teams</p>
            <h2 id="team-ai-spend-heading" className="mt-3 text-3xl font-semibold leading-[1.1] tracking-[-0.03em] sm:text-4xl">
              Make AI coding spend, seats, and plans visible before renewal.
            </h2>
            <p className="mt-4 text-base leading-7 text-muted-foreground md:text-lg">
              Start with the decision your team needs to make, then follow the evidence across tools, models, developers, and devices.
            </p>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {[
              {
                href: "/solutions/ai-coding-spend-management",
                title: "AI coding spend management",
                description: "Track cost by developer, tool, and model across the AI coding fleet.",
              },
              {
                href: "/solutions/ai-coding-seat-utilization",
                title: "Seat utilization and waste",
                description: "Find idle seats, quota pressure, and missing device coverage before renewal.",
              },
              {
                href: "/solutions/ai-coding-plan-usage",
                title: "AI coding plan usage",
                description: "Compare cycles, quotas, heavy users, and plan fit across vendors.",
              },
            ].map((item) => (
              <Link key={item.href} href={item.href} className="group border border-border bg-white p-6 transition-colors hover:border-[#08a8c4]">
                <h3 className="text-lg font-semibold tracking-tight group-hover:text-[#08758a]">{item.title}</h3>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">{item.description}</p>
                <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-[#08758a]">
                  Explore the solution <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                </span>
              </Link>
            ))}
          </div>
          <div className="mt-7 flex flex-wrap gap-x-6 gap-y-3 text-sm font-medium">
            <Link href="/guides/see-team-ai-coding-usage" className="text-[#08758a] hover:underline">See team AI coding usage</Link>
            <Link href="/compare/wakatime" className="text-[#08758a] hover:underline">WakaTime alternative for AI coding teams</Link>
          </div>
        </div>
      </section>

      <HomeWorldClass />

      <section id="pricing" className="scroll-mt-20  order bg-white py-20 sm:py-24 lg:py-32">
        <div className="mx-auto w-full max-w-[1440px] px-4 sm:px-6 lg:px-10 xl:px-12">
          <h2 className="mx-auto max-w-3xl text-center text-3xl font-semibold leading-[1.1] tracking-[-0.03em] sm:text-4xl lg:text-[2.5rem]">
            AI spend is data.{" "}
            <span className="text-[#08a8c4]">Turn it into decisions.</span>
          </h2>

          <div className="mx-auto mt-12 grid max-w-6xl gap-4 sm:mt-16 lg:grid-cols-3 lg:items-center lg:gap-5">
            {PRICING_PLANS.map((plan) => {
              const isCommunity = plan.id === "community";
              const featured = plan.featured;
              return (
                <article
                  key={plan.id}
                  className={cn(
                    "relative flex flex-col bg-white p-6 sm:p-8",
                    featured
                      ? "pricing-card-managed border-2 border-[#9fd4df]"
                      : cn(
                          "pricing-card-side",
                          isCommunity ? "border border-[#08a8c4]/40" : "border order",
                        ),
                  )}
                >
                  {"badge" in plan && plan.badge ? (
                    <span className="absolute right-5 top-5 text-xs font-semibold text-[#08758a]">
                      {plan.badge}
                    </span>
                  ) : null}

                  <div className="flex items-baseline gap-2">
                    <h3 className="text-lg font-semibold tracking-tight">{plan.name}</h3>
                    {isCommunity ? (
                      <span className="text-xs font-medium text-[#08a8c4]">{plan.description}</span>
                    ) : null}
                  </div>

                  <div className="mt-6">
                    <p className="text-4xl font-semibold tracking-[-0.03em]">{plan.price}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{plan.period}</p>
                  </div>

                  {"calendly" in plan.cta && plan.cta.calendly ? (
                    <CalendlyTalkButton
                      label={plan.cta.label}
                      className="mt-6 public-btn-outline hover:border-[#08a8c4] hover:text-[#08a8c4]"
                    />
                  ) : (
                    <a
                      href={plan.cta.href}
                      className={cn(
                        "public-btn mt-6 w-full rounded-none font-semibold",
                        featured
                          ? "public-btn-yellow"
                          : "public-btn-outline hover:border-[#08a8c4] hover:text-[#08a8c4]",
                      )}
                    >
                      {plan.cta.label}
                      {featured ? <ArrowRight className="h-4 w-4" /> : null}
                    </a>
                  )}

                  <ul className="mt-8 space-y-3">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex gap-3 text-sm leading-6 text-[#5c5e56]">
                        <Check className="mt-0.5 size-4 shrink-0 text-[#08a8c4]" strokeWidth={2.25} />
                        {feature}
                      </li>
                    ))}
                  </ul>

                  {plan.premiumFeatures.length > 0 ? (
                    <>
                      <div className="my-6 flex items-center gap-3" aria-hidden>
                        <div className="h-px flex-1 bg-border" />
                        <Plus className="size-3.5 text-[#08a8c4]" strokeWidth={2.5} />
                        <div className="h-px flex-1 bg-border" />
                      </div>
                      <ul className="space-y-3">
                        {plan.premiumFeatures.map((feature) => (
                          <li key={feature} className="flex gap-3 text-sm leading-6">
                            <Check className="mt-0.5 size-4 shrink-0 text-[#08a8c4]" strokeWidth={2.25} />
                            {feature}
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : null}
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section id="faq" className="scroll-mt-20  order bg-white py-20 sm:py-24 lg:py-32">
        <div className="mx-auto w-full max-w-[1440px] px-4 sm:px-6 lg:px-10 xl:px-12">
          <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[0.75fr_1.25fr] lg:gap-16">
            <div>
              <h2 className="mt-5 text-3xl font-semibold leading-[1.1] tracking-[-0.03em] sm:text-4xl lg:text-[2.5rem]">
                Clear answers before you start.
              </h2>
            </div>
            <Accordion type="single" collapsible className="border-t order">
              {HOME_FAQS.map((faq, index) => (
                <AccordionItem key={faq.question} value={`faq-${index}`}>
                  <AccordionTrigger className="py-6 text-left text-base font-semibold md:text-lg">
                    {faq.question}
                  </AccordionTrigger>
                  <AccordionContent className="max-w-2xl pb-6 text-sm leading-7 text-muted-foreground md:text-base">
                    {faq.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
