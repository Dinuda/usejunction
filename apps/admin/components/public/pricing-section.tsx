import { Check, Plus } from "lucide-react";
import { PRICING_PLANS } from "@/lib/public/config";
import { cn } from "@/lib/utils";

function FeatureList({
  items,
  accent = false,
}: {
  items: readonly string[];
  accent?: boolean;
}) {
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-2.5 text-sm leading-snug">
          <Check
            className="mt-0.5 h-4 w-4 shrink-0"
            style={{ color: accent ? "var(--public-accent)" : "var(--public-muted)" }}
            strokeWidth={2}
          />
          <span className={accent ? "text-[var(--public-fg)]" : "text-muted-foreground"}>
            {item}
          </span>
        </li>
      ))}
    </ul>
  );
}

function FeatureDivider({ featured }: { featured?: boolean }) {
  return (
    <div className="relative my-5 border-t" style={{ borderColor: "var(--public-border)" }}>
      <span
        className="absolute left-1/2 top-0 flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center text-[var(--public-muted)]"
        style={{
          background: featured
            ? "color-mix(in srgb, var(--public-accent) 6%, var(--public-surface))"
            : "var(--public-surface)",
        }}
      >
        <Plus className="h-3 w-3" strokeWidth={2} />
      </span>
    </div>
  );
}

export function PricingSection() {
  return (
    <section
      id="pricing"
      className="public-section scroll-mt-20"
      style={{ background: "var(--public-bg)" }}
    >
      <div className="container">
        <div className="mx-auto max-w-2xl text-center">
          <p className="public-eyebrow mb-4">Pricing</p>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Simple, transparent pricing
          </h2>
          <p className="mt-4 text-base text-muted-foreground">
            Open source and self-hosted. No hidden fees — your data stays on your infrastructure.
          </p>
        </div>

        <div
          className="mt-14 grid gap-px lg:grid-cols-3"
          style={{ background: "var(--public-border)" }}
        >
          {PRICING_PLANS.map((plan) => (
            <div
              key={plan.id}
              className={cn(
                "relative flex flex-col border-0 p-8",
                plan.featured
                  ? "bg-[color-mix(in_srgb,var(--public-accent)_5%,var(--public-surface))]"
                  : "bg-[var(--public-surface)]"
              )}
              style={
                plan.featured
                  ? { boxShadow: "inset 0 0 0 1px var(--public-accent)" }
                  : undefined
              }
            >
              {plan.featured && "badge" in plan && plan.badge && (
                <span
                  className="absolute right-6 top-6 px-2.5 py-1 text-xs font-medium"
                  style={{
                    background: "var(--public-accent)",
                    color: "var(--public-accent-fg)",
                  }}
                >
                  {plan.badge}
                </span>
              )}

              <div className="pr-16">
                <h3 className="text-lg font-semibold">{plan.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{plan.description}</p>
              </div>

              <div className="mt-8">
                <span className="text-4xl font-bold tracking-tight">{plan.price}</span>
                <p className="mt-1 text-sm text-muted-foreground">{plan.period}</p>
              </div>

              <a
                href={plan.cta.href}
                target={plan.cta.href.startsWith("http") ? "_blank" : undefined}
                rel={plan.cta.href.startsWith("http") ? "noopener noreferrer" : undefined}
                className={cn(
                  "public-btn mt-8 w-full text-sm",
                  plan.featured ? "public-btn-primary" : "public-btn-outline"
                )}
              >
                {plan.cta.label}
              </a>

              <div className="mt-8 flex-1">
                <FeatureList items={plan.features} />
                {plan.premiumFeatures.length > 0 && (
                  <>
                    <FeatureDivider featured={plan.featured} />
                    <FeatureList items={plan.premiumFeatures} accent />
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
