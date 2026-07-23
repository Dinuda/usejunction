"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Loader2 } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { useBillingNavigation } from "@/components/saas-billing/use-billing-navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { TEAM_CHECKOUT_MEDIA_PATHS } from "@/lib/saas-billing/checkout-presentation";
import { TEAM_PRICE_PER_DEV_USD, USER_LIMIT_FREE } from "@/lib/saas-billing/entitlements";
import type { OrgBillingStatus } from "@/lib/saas-billing/status";
import { cn } from "@/lib/utils";

export type TeamUpgradeMember = {
  id: string;
  name: string;
  email: string;
};

type TeamUpgradeCheckoutProps = {
  billing: OrgBillingStatus;
  members: TeamUpgradeMember[];
  email: string;
  name: string | null;
};

type PlanId = "community" | "team";

const PLANS: Array<{
  id: PlanId;
  name: string;
  priceLabel: string;
  billingLine: string;
  blurb: string;
}> = [
  {
    id: "community",
    name: "Community",
    priceLabel: "$0.00",
    billingLine: `Free for up to ${USER_LIMIT_FREE} seats`,
    blurb: "Self-host friendly. Best for trying Junction with a small roster.",
  },
  {
    id: "team",
    name: "Team",
    priceLabel: `$${TEAM_PRICE_PER_DEV_USD}.00`,
    billingLine: `$${TEAM_PRICE_PER_DEV_USD}.00 per active developer, billed monthly`,
    blurb: "Hosted control plane with Signals, multi-device, and unlimited seats.",
  },
];

const MEDIA = [
  {
    src: TEAM_CHECKOUT_MEDIA_PATHS[0],
    alt: "UseJunction on a laptop",
    caption: "See every developer’s AI usage in one place",
  },
  {
    src: TEAM_CHECKOUT_MEDIA_PATHS[1],
    alt: "Team member illustration",
    caption: "Attribute cost and activity per person",
  },
  {
    src: TEAM_CHECKOUT_MEDIA_PATHS[2],
    alt: "Device connecting illustration",
    caption: "Keep devices healthy across the fleet",
  },
] as const;

function memberInitials(name: string, email: string) {
  const source = name.trim() || email.trim();
  const words = source.split(/\s+/).filter(Boolean);
  if (words.length > 1) return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

function formatUsd(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

export function TeamUpgradeCheckout({ billing, members, email, name }: TeamUpgradeCheckoutProps) {
  const router = useRouter();
  const { error, loading, openCheckout } = useBillingNavigation();
  const [plan, setPlan] = useState<PlanId>("team");
  const [mediaIndex, setMediaIndex] = useState(0);

  const seats = Math.max(1, billing.usersUsed);
  const total = seats * TEAM_PRICE_PER_DEV_USD;
  const selected = PLANS.find((entry) => entry.id === plan) ?? PLANS[1];

  useEffect(() => {
    if (!billing.canUpgrade) {
      router.replace("/settings#settings-billing");
    }
  }, [billing.canUpgrade, router]);

  useEffect(() => {
    const id = window.setInterval(() => {
      setMediaIndex((current) => (current + 1) % MEDIA.length);
    }, 4200);
    return () => window.clearInterval(id);
  }, []);

  if (!billing.canUpgrade) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center p-8 text-sm text-muted-foreground">
        Redirecting to billing…
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl overflow-hidden rounded-2xl border border-border/70 bg-card shadow-[0_24px_60px_-36px_rgba(32,36,25,0.35)]">
      <div className="grid min-h-[min(720px,calc(100vh-8rem))] lg:grid-cols-2">
        <section className="flex flex-col gap-6 bg-muted/40 p-6 sm:p-8 lg:p-10">
          <div className="flex items-center justify-between gap-4">
            <BrandLogo className="h-8" />
            <Link
              href="/settings#settings-billing"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              Back
            </Link>
          </div>

          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              UseJunction Team
            </h1>
            <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">
              Upgrade your workspace for hosted Junction with per-developer attribution, Signals,
              and seats that grow with your roster.
            </p>
          </div>

          <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-background">
            <div className="relative aspect-[16/10]">
              {MEDIA.map((item, index) => (
                <Image
                  key={item.src}
                  src={item.src}
                  alt={item.alt}
                  fill
                  priority={index === 0}
                  sizes="(max-width: 1024px) 100vw, 40vw"
                  className={cn(
                    "object-cover transition-opacity duration-700",
                    index === mediaIndex ? "opacity-100" : "opacity-0",
                  )}
                />
              ))}
              <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
                {MEDIA.map((item, index) => (
                  <button
                    key={item.src}
                    type="button"
                    aria-label={`Show image ${index + 1}`}
                    className={cn(
                      "size-2 rounded-full transition-colors",
                      index === mediaIndex ? "bg-white" : "bg-white/40 hover:bg-white/70",
                    )}
                    onClick={() => setMediaIndex(index)}
                  />
                ))}
              </div>
            </div>
            <p className="border-t border-border/60 px-4 py-3 text-sm text-muted-foreground">
              {MEDIA[mediaIndex].caption}
            </p>
          </div>

          <div className="space-y-3" role="radiogroup" aria-label="Choose a plan">
            {PLANS.map((option) => {
              const active = plan === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setPlan(option.id)}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-xl border px-4 py-4 text-left transition-all",
                    active
                      ? "border-primary bg-primary/5 shadow-[0_0_0_1px_var(--primary)]"
                      : "border-border/80 bg-background hover:border-border hover:bg-background/80",
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border",
                      active ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40",
                    )}
                    aria-hidden="true"
                  >
                    {active ? <Check className="size-2.5 stroke-[3]" /> : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="font-semibold tracking-tight">{option.name}</span>
                      <span className="shrink-0 tabular-nums text-sm font-medium">
                        {option.id === "team" ? `from ${option.priceLabel}` : option.priceLabel}
                      </span>
                    </span>
                    <span className="mt-1 block text-sm text-muted-foreground">{option.billingLine}</span>
                    <span className="mt-2 block text-sm leading-5 text-muted-foreground">{option.blurb}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="flex flex-col justify-between gap-8 bg-background p-6 sm:p-8 lg:p-10">
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Checkout</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Confirm your roster, then continue to secure payment.
              </p>
            </div>

            <label className="block space-y-2">
              <span className="text-sm font-medium">Email address</span>
              <input
                type="email"
                readOnly
                value={email}
                className="h-11 w-full rounded-lg border border-border bg-muted/30 px-3 text-sm text-foreground outline-none"
              />
            </label>

            {name ? (
              <label className="block space-y-2">
                <span className="text-sm font-medium">Account name</span>
                <input
                  type="text"
                  readOnly
                  value={name}
                  className="h-11 w-full rounded-lg border border-border bg-muted/30 px-3 text-sm text-foreground outline-none"
                />
              </label>
            ) : null}

            <div>
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold">
                  Active members{" "}
                  <span className="font-normal text-muted-foreground">({billing.usersUsed})</span>
                </h3>
                <Link
                  href="/team"
                  className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                >
                  Manage team
                </Link>
              </div>
              <ul className="uj-scrollbar mt-3 max-h-48 space-y-0 overflow-y-auto rounded-xl border border-border/70 divide-y divide-border/70">
                {members.length ? (
                  members.map((member) => (
                    <li key={member.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                      <div className="flex min-w-0 items-center gap-3">
                        <Avatar className="size-8">
                          <AvatarFallback className="text-[0.65rem]">
                            {memberInitials(member.name, member.email)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{member.name}</p>
                          <p className="truncate text-xs text-muted-foreground">{member.email}</p>
                        </div>
                      </div>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {plan === "team" ? formatUsd(TEAM_PRICE_PER_DEV_USD) : "Free"}
                      </span>
                    </li>
                  ))
                ) : (
                  <li className="px-3 py-4 text-sm text-muted-foreground">
                    No active members yet — checkout starts at 1 seat.
                  </li>
                )}
              </ul>
            </div>

            <div className="space-y-2 border-t border-border/70 pt-4 text-sm">
              <div className="flex items-center justify-between gap-3 text-muted-foreground">
                <span>Subtotal</span>
                <span className="tabular-nums">
                  {plan === "team" ? formatUsd(total) : formatUsd(0)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3 text-base font-semibold">
                <span>Total</span>
                <span className="tabular-nums">
                  {plan === "team" ? formatUsd(total) : formatUsd(0)}
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {error ? (
              <Alert variant="destructive" className="rounded-xl bg-card">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            {plan === "team" ? (
              <Button
                type="button"
                size="lg"
                className="h-12 w-full rounded-xl text-base font-semibold"
                disabled={loading}
                aria-busy={loading}
                onClick={openCheckout}
              >
                {loading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
                {loading ? "Opening checkout…" : `Pay ${formatUsd(total)}`}
              </Button>
            ) : (
              <Button asChild size="lg" variant="outline" className="h-12 w-full rounded-xl text-base font-semibold">
                <Link href="/settings#settings-billing">Stay on Community</Link>
              </Button>
            )}

            <p className="text-center text-xs leading-5 text-muted-foreground">
              {plan === "team"
                ? `You will be charged ${formatUsd(TEAM_PRICE_PER_DEV_USD)} per active developer every month. Seat changes sync automatically on the next bill.`
                : `Community stays free for up to ${USER_LIMIT_FREE} seats.`}
            </p>
            <p className="text-center text-[0.7rem] text-muted-foreground">
              Payment is completed securely on Lemon Squeezy for the{" "}
              <span className="font-medium text-foreground">{selected.name}</span> plan.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
