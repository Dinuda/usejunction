"use client";

import { useMemo, useState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { TEAM_PRICE_PER_DEV_USD } from "@/lib/saas-billing/entitlements";
import type { OrgBillingStatus } from "@/lib/saas-billing/status";

type PlanStatusCardProps = {
  billing: OrgBillingStatus;
};

function statusLine(billing: OrgBillingStatus) {
  if (billing.isAtSeatCapacity && billing.canManage) {
    return "All seats used — add seats to invite more";
  }

  if (billing.isAtDeviceLimit && !billing.canManage) {
    return "Device limit reached — upgrade to add more";
  }

  if (billing.effectivePlan === "trial") {
    if (billing.trialDaysLeft === 0) return "Trial ended";
    if (billing.trialDaysLeft === 1) return "1 day left in trial";
    return `${billing.trialDaysLeft} days left in trial`;
  }

  if (billing.effectivePlan === "team" || billing.effectivePlan === "enterprise") {
    if (billing.subscriptionStatus === "cancelled") return "Cancels at period end";
    return "Active subscription";
  }

  return "Free tier";
}

export function PlanStatusCard({ billing }: PlanStatusCardProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [addSeatsOpen, setAddSeatsOpen] = useState(false);
  const [seatQuantity, setSeatQuantity] = useState(billing.minCheckoutSeats);
  const [addSeatsQuantity, setAddSeatsQuantity] = useState(
    Math.max(billing.minCheckoutSeats, (billing.purchasedSeats ?? billing.minCheckoutSeats) + 1),
  );

  const paid = billing.effectivePlan === "team" || billing.effectivePlan === "enterprise";
  const coverageLabel = paid
    ? billing.purchasedSeats !== null
      ? `${billing.developerCount} / ${billing.purchasedSeats} seats`
      : `${billing.developerCount} developers`
    : billing.devicesLimit === null
      ? `${billing.devicesUsed} devices enrolled`
      : `${billing.devicesUsed} / ${billing.devicesLimit} devices`;

  const checkoutEstimate = useMemo(
    () => seatQuantity * TEAM_PRICE_PER_DEV_USD,
    [seatQuantity],
  );
  const addSeatsEstimate = useMemo(
    () => addSeatsQuantity * TEAM_PRICE_PER_DEV_USD,
    [addSeatsQuantity],
  );

  const checkoutValid = Number.isInteger(seatQuantity) && seatQuantity >= billing.minCheckoutSeats;
  const addSeatsMin = Math.max(billing.minCheckoutSeats, billing.purchasedSeats ?? billing.minCheckoutSeats);
  const addSeatsValid = Number.isInteger(addSeatsQuantity) && addSeatsQuantity >= addSeatsMin;

  async function openCheckoutDialog() {
    setError(null);
    setSeatQuantity(billing.minCheckoutSeats);
    setCheckoutOpen(true);
  }

  async function openAddSeatsDialog() {
    setError(null);
    setAddSeatsQuantity(Math.max(addSeatsMin, (billing.purchasedSeats ?? addSeatsMin) + 1));
    setAddSeatsOpen(true);
  }

  async function submitCheckout() {
    if (!checkoutValid) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity: seatQuantity }),
      });
      const data = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !data.url) {
        throw new Error(data.error?.trim() || "Checkout unavailable");
      }
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout unavailable");
      setLoading(false);
    }
  }

  async function submitAddSeats() {
    if (!addSeatsValid) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/billing/seats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity: addSeatsQuantity }),
      });
      const data = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !data.ok) {
        throw new Error(data.error?.trim() || "Could not update seats");
      }
      setAddSeatsOpen(false);
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update seats");
    } finally {
      setLoading(false);
    }
  }

  async function openPortal() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/billing/portal", { method: "POST" });
      const data = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !data.url) {
        throw new Error(data.error?.trim() || "Billing portal unavailable");
      }
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Billing portal unavailable");
      setLoading(false);
    }
  }

  return (
    <div
      className="uj-grid-texture relative overflow-hidden rounded-xl text-white shadow-[0_10px_24px_-10px_rgba(192,104,44,0.35)] [--uj-grid-opacity:0.05]"
      style={{
        backgroundColor: "var(--brand-orange)",
      }}
    >
      <div className="pointer-events-none absolute inset-0 z-0 bg-gradient-to-br from-black/10 via-transparent to-transparent" />
      <div className="relative z-10 space-y-3.5 p-4">
        <div>
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-white/90">Plan</p>
          <p className="mt-1 text-lg font-semibold leading-tight tracking-tight text-white">{billing.planLabel}</p>
          <p className="mt-1 text-sm text-white/90">{statusLine(billing)}</p>
        </div>

        <div>
          <div className="flex items-center justify-between gap-2 text-sm font-medium">
            <span className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-white/90">
              {paid ? "Seats" : "Coverage"}
            </span>
            <span className="tabular-nums text-white">{coverageLabel}</span>
          </div>
          {billing.coveragePercent !== null && (
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-black/25">
              <div
                className={cn("h-full rounded-full bg-white transition-all")}
                style={{ width: `${billing.coveragePercent}%` }}
              />
            </div>
          )}
        </div>

        {billing.canUpgrade && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="relative z-20 h-9 w-full border-0 bg-white font-semibold shadow-sm hover:bg-[var(--brand-orange-pale)] [background-image:none]"
            style={{ color: "var(--brand-orange-dark)" }}
            disabled={loading}
            onClick={openCheckoutDialog}
          >
            Upgrade to Team
            <ArrowRight className="size-4" />
          </Button>
        )}

        {billing.canManage && (
          <div className="space-y-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="relative z-20 h-9 w-full border-0 bg-white font-semibold shadow-sm hover:bg-[var(--brand-orange-pale)] [background-image:none]"
              style={{ color: "var(--brand-orange-dark)" }}
              disabled={loading}
              onClick={openPortal}
            >
              {loading ? <Loader2 className="size-4 animate-spin" /> : "Manage billing"}
              {!loading && <ArrowRight className="size-4" />}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="relative z-20 h-9 w-full border border-white/40 bg-transparent font-semibold text-white hover:bg-white/10 [background-image:none]"
              disabled={loading}
              onClick={openAddSeatsDialog}
            >
              Add seats
            </Button>
          </div>
        )}

        {error && !checkoutOpen && !addSeatsOpen && (
          <p className="text-xs font-medium" style={{ color: "var(--brand-orange-pale)" }}>
            {error}
          </p>
        )}
      </div>

      <Dialog open={checkoutOpen} onOpenChange={setCheckoutOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>How many developer seats?</DialogTitle>
            <DialogDescription>
              You have {billing.developerCount} developer{billing.developerCount === 1 ? "" : "s"} on the roster.
              Choose at least that many seats — you can buy ahead (for example 12) even if free tier capped devices at 10.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <label className="block text-sm font-medium" htmlFor="checkout-seats">
              Seats
            </label>
            <input
              id="checkout-seats"
              type="number"
              min={billing.minCheckoutSeats}
              step={1}
              value={seatQuantity}
              onChange={(event) => setSeatQuantity(Number(event.target.value))}
              className="h-10 w-full border border-border bg-background px-3 text-sm tabular-nums"
            />
            <p className="text-sm text-muted-foreground">
              Estimated <span className="font-medium text-foreground">${checkoutEstimate}</span> / month
              ({seatQuantity} × ${TEAM_PRICE_PER_DEV_USD})
            </p>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCheckoutOpen(false)} disabled={loading}>
              Cancel
            </Button>
            <Button type="button" onClick={submitCheckout} disabled={loading || !checkoutValid}>
              {loading ? <Loader2 className="size-4 animate-spin" /> : "Continue to checkout"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addSeatsOpen} onOpenChange={setAddSeatsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add developer seats</DialogTitle>
            <DialogDescription>
              Increase purchased seats so you can invite more people. Minimum is {addSeatsMin}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <label className="block text-sm font-medium" htmlFor="add-seats">
              Total seats
            </label>
            <input
              id="add-seats"
              type="number"
              min={addSeatsMin}
              step={1}
              value={addSeatsQuantity}
              onChange={(event) => setAddSeatsQuantity(Number(event.target.value))}
              className="h-10 w-full border border-border bg-background px-3 text-sm tabular-nums"
            />
            <p className="text-sm text-muted-foreground">
              New monthly estimate <span className="font-medium text-foreground">${addSeatsEstimate}</span>
            </p>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAddSeatsOpen(false)} disabled={loading}>
              Cancel
            </Button>
            <Button type="button" onClick={submitAddSeats} disabled={loading || !addSeatsValid}>
              {loading ? <Loader2 className="size-4 animate-spin" /> : "Update seats"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
