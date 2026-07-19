"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Check, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { ToolLogoTile } from "./tool-brand-icon";
import { formatMicrosAsCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

type Cadence = "weekly" | "monthly" | "annual" | "custom";
type CatalogPlan = {
  key: string;
  name: string;
  tier: string;
  description: string;
  prices: Partial<Record<Cadence, string>>;
  includedCycleMicros: string;
  customPrice?: boolean;
  minimumSeats?: number;
};
type CatalogTool = {
  key: string;
  name: string;
  shortName: string;
  aliases: string[];
  sourceUrl: string;
  lastVerifiedAt: string;
  plans: CatalogPlan[];
};

const dollarsToMicros = (value: string) => String(Math.round(Number(value || 0) * 1_000_000));

export type AddSubscriptionSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Prefill a tool when opening from a known context. */
  initialToolKey?: string | null;
  onCreated?: () => void | Promise<void>;
};

export function AddSubscriptionSheet({
  open,
  onOpenChange,
  initialToolKey = null,
  onCreated,
}: AddSubscriptionSheetProps) {
  const [catalog, setCatalog] = useState<CatalogTool[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedToolKey, setSelectedToolKey] = useState<string | null>(null);
  const [selectedPlanKey, setSelectedPlanKey] = useState<string | null>(null);
  const [cadence, setCadence] = useState<Cadence>("monthly");
  const [seats, setSeats] = useState(1);
  const [customPrice, setCustomPrice] = useState("");
  const [advanced, setAdvanced] = useState({
    included: "",
    input: "",
    output: "",
    cache: "",
    billingOwner: "",
    billingCycleAnchorDate: "",
    nextRenewalDate: "",
    billingCycleDays: "",
    externalReference: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);

  const reset = useCallback((toolKey: string | null = null) => {
    setSelectedToolKey(toolKey);
    setSelectedPlanKey(null);
    setCadence("monthly");
    setSeats(1);
    setCustomPrice("");
    setAdvanced({
      included: "",
      input: "",
      output: "",
      cache: "",
      billingOwner: "",
      billingCycleAnchorDate: "",
      nextRenewalDate: "",
      billingCycleDays: "",
      externalReference: "",
      notes: "",
    });
    setError(null);
  }, []);

  useEffect(() => {
    if (!open) return;
    reset(initialToolKey);
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const response = await fetch("/api/tools/catalog");
      const body = await response.json().catch(() => ({}));
      if (cancelled) return;
      if (!response.ok) setError(body.error ?? "Could not load catalog");
      else setCatalog(body.tools ?? []);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, initialToolKey, reset]);

  const selectedTool = catalog.find((tool) => tool.key === selectedToolKey);
  const selectedPlan = selectedTool?.plans.find((plan) => plan.key === selectedPlanKey);
  const supportedCadences = selectedPlan ? (Object.keys(selectedPlan.prices) as Cadence[]) : [];
  const needsCustomPrice = Boolean(
    selectedPlan?.customPrice || (selectedPlan && !selectedPlan.prices[cadence]),
  );

  function choosePlan(plan: CatalogPlan) {
    setSelectedPlanKey(plan.key);
    const cadences = Object.keys(plan.prices) as Cadence[];
    setCadence(cadences.includes("monthly") ? "monthly" : (cadences[0] ?? "custom"));
    setSeats(Math.max(1, plan.minimumSeats ?? 1));
    setCustomPrice(
      plan.customPrice && plan.prices.monthly
        ? formatMicrosAsCurrency(plan.prices.monthly).replace(/[^0-9.]/g, "")
        : "",
    );
  }

  function priceForCadence(plan: CatalogPlan, selectedCadence: Cadence) {
    const value = plan.prices[selectedCadence];
    if (!value) return "0";
    return selectedCadence === "annual" ? String(BigInt(value) * BigInt(12)) : value;
  }

  async function createSubscription() {
    if (!selectedTool || !selectedPlan) return;
    setSaving(true);
    setError(null);
    const response = await fetch("/api/tools/subscriptions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        toolKey: selectedTool.key,
        planKey: selectedPlan.key,
        billingCadence: cadence,
        seatCapacity: seats,
        ...(needsCustomPrice ? { cycleSeatMicros: dollarsToMicros(customPrice) } : {}),
        ...(advanced.included ? { includedCycleMicros: dollarsToMicros(advanced.included) } : {}),
        ...(advanced.input ? { inputRateMicrosPerMillion: dollarsToMicros(advanced.input) } : {}),
        ...(advanced.output ? { outputRateMicrosPerMillion: dollarsToMicros(advanced.output) } : {}),
        ...(advanced.cache ? { cacheRateMicrosPerMillion: dollarsToMicros(advanced.cache) } : {}),
        ...(advanced.billingCycleAnchorDate ? { billingCycleAnchorDate: advanced.billingCycleAnchorDate } : {}),
        ...(advanced.nextRenewalDate ? { nextRenewalDate: advanced.nextRenewalDate } : {}),
        ...(cadence === "custom" ? { billingCycleDays: Number(advanced.billingCycleDays || 0) } : {}),
        billingOwner: advanced.billingOwner || null,
        externalReference: advanced.externalReference || null,
        notes: advanced.notes || null,
      }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(body.error ?? "Could not add subscription");
      setSaving(false);
      return;
    }
    onOpenChange(false);
    await onCreated?.();
    setSaving(false);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader className="border-b px-6 py-5">
          <SheetTitle>
            {selectedPlan
              ? `Add ${selectedTool?.shortName}`
              : selectedTool
                ? `Choose a ${selectedTool.shortName} plan`
                : "Add a team tool"}
          </SheetTitle>
          <SheetDescription>
            {selectedPlan
              ? "Confirm billing and seat quantity."
              : selectedTool
                ? "Select the plan your company owns."
                : "Start with the tool—provider details are handled automatically."}
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-5 px-6 py-5">
          {(selectedTool || selectedPlan) && (
            <Button
              variant="ghost"
              size="sm"
              className="-ml-2"
              onClick={() => (selectedPlan ? setSelectedPlanKey(null) : setSelectedToolKey(null))}
            >
              <ArrowLeft /> Back
            </Button>
          )}
          {loading ? (
            <div className="flex min-h-40 items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 size-4 animate-spin" /> Loading catalog
            </div>
          ) : !selectedTool ? (
            <div className="grid grid-cols-1 gap-3 min-[380px]:grid-cols-2">
              {catalog.map((tool) => (
                <button
                  key={tool.key}
                  type="button"
                  onClick={() => setSelectedToolKey(tool.key)}
                  className="rounded-xl border p-4 text-left outline-none transition hover:border-primary/50 hover:bg-muted/30 focus-visible:ring-3 focus-visible:ring-ring/40"
                >
                  <ToolLogoTile tool={tool.key} size="lg" />
                  <p className="mt-3 font-medium">{tool.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{tool.plans.length} plans available</p>
                </button>
              ))}
            </div>
          ) : !selectedPlan ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {selectedTool.plans.map((plan) => (
                <button
                  key={plan.key}
                  type="button"
                  onClick={() => choosePlan(plan)}
                  aria-pressed={selectedPlanKey === plan.key}
                  className="rounded-xl border p-4 text-left outline-none transition hover:border-primary/50 focus-visible:ring-3 focus-visible:ring-ring/40"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-medium">{plan.name}</p>
                    <p className="text-sm font-semibold">{plan.prices.monthly ? `${formatMicrosAsCurrency(plan.prices.monthly)}/cycle` : "Custom"}</p>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{plan.description}</p>
                  {Object.keys(plan.prices).length > 1 && (
                    <p className="mt-3 text-xs font-medium text-primary">Annual pricing available</p>
                  )}
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-5">
              <div className="flex items-center gap-3 rounded-xl border bg-muted/20 p-4">
                <ToolLogoTile tool={selectedTool.key} />
                <div className="flex-1">
                  <p className="font-medium">
                    {selectedTool.name} · {selectedPlan.name}
                  </p>
                  <p className="text-sm text-muted-foreground">{selectedPlan.description}</p>
                </div>
                <Check className="size-5 text-primary" />
              </div>
              {(supportedCadences.length > 1 || selectedPlan.customPrice) && (
                <div>
                  <Label className="mb-2">Billing cadence</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      ...supportedCadences,
                      ...(selectedPlan.customPrice && !supportedCadences.includes("custom")
                        ? (["custom"] as const)
                        : []),
                    ].map((item) => (
                      <button
                        key={item}
                        type="button"
                        aria-pressed={cadence === item}
                        onClick={() => setCadence(item)}
                        className={cn(
                          "rounded-lg border px-3 py-2 text-sm capitalize outline-none focus-visible:ring-3 focus-visible:ring-ring/40",
                          cadence === item && "border-primary bg-primary/5 text-primary",
                        )}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <Label htmlFor="seat-quantity" className="mb-2">
                  Seats
                </Label>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label="Remove one seat"
                    onClick={() => setSeats(Math.max(selectedPlan.minimumSeats ?? 1, seats - 1))}
                  >
                    −
                  </Button>
                  <Input
                    id="seat-quantity"
                    type="number"
                    min={selectedPlan.minimumSeats ?? 1}
                    value={seats}
                    onChange={(event) =>
                      setSeats(Math.max(selectedPlan.minimumSeats ?? 1, Number(event.target.value)))
                    }
                    className="w-20 text-center"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label="Add one seat"
                    onClick={() => setSeats(seats + 1)}
                  >
                    +
                  </Button>
                  <span className="ml-2 text-sm text-muted-foreground">
                    {formatMicrosAsCurrency(
                      needsCustomPrice
                        ? dollarsToMicros(customPrice || "0")
                        : priceForCadence(selectedPlan, cadence),
                    )}{" "}
                    per seat / cycle
                  </span>
                </div>
                {selectedPlan.minimumSeats && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    This plan has a {selectedPlan.minimumSeats}-seat minimum.
                  </p>
                )}
              </div>
              {needsCustomPrice && (
                <div>
                  <Label htmlFor="custom-price" className="mb-2">
                    Cycle price per seat (USD)
                  </Label>
                  <Input
                    id="custom-price"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={customPrice}
                    onChange={(event) => setCustomPrice(event.target.value)}
                  />
                </div>
              )}
              <details className="rounded-lg border">
                <summary className="cursor-pointer px-4 py-3 text-sm font-medium">Advanced billing</summary>
                <div className="space-y-4 border-t px-4 py-4">
                  <p className="text-sm text-muted-foreground">
                    Optional rates and internal billing references.
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <AdvancedField
                      label="Included cycle credits (USD)"
                      value={advanced.included}
                      onChange={(value) => setAdvanced({ ...advanced, included: value })}
                      type="number"
                    />
                    <AdvancedField
                      label="Billing owner"
                      value={advanced.billingOwner}
                      onChange={(value) => setAdvanced({ ...advanced, billingOwner: value })}
                    />
                    <AdvancedField
                      label="Input rate / 1M tokens"
                      value={advanced.input}
                      onChange={(value) => setAdvanced({ ...advanced, input: value })}
                      type="number"
                    />
                    <AdvancedField
                      label="Output rate / 1M tokens"
                      value={advanced.output}
                      onChange={(value) => setAdvanced({ ...advanced, output: value })}
                      type="number"
                    />
                    <AdvancedField
                      label="Cache rate / 1M tokens"
                      value={advanced.cache}
                      onChange={(value) => setAdvanced({ ...advanced, cache: value })}
                      type="number"
                    />
                    <AdvancedField
                      label="Current cycle start"
                      value={advanced.billingCycleAnchorDate}
                      onChange={(value) => setAdvanced({ ...advanced, billingCycleAnchorDate: value })}
                      type="date"
                    />
                    <AdvancedField
                      label="Next renewal"
                      value={advanced.nextRenewalDate}
                      onChange={(value) => setAdvanced({ ...advanced, nextRenewalDate: value })}
                      type="date"
                    />
                    {cadence === "custom" && (
                      <AdvancedField
                        label="Custom cycle days"
                        value={advanced.billingCycleDays}
                        onChange={(value) => setAdvanced({ ...advanced, billingCycleDays: value })}
                        type="number"
                      />
                    )}
                    <AdvancedField
                      label="Account reference"
                      value={advanced.externalReference}
                      onChange={(value) => setAdvanced({ ...advanced, externalReference: value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="subscription-notes" className="mb-2">
                      Notes
                    </Label>
                    <Textarea
                      id="subscription-notes"
                      value={advanced.notes}
                      onChange={(event) => setAdvanced({ ...advanced, notes: event.target.value })}
                      rows={3}
                    />
                  </div>
                  <a
                    href={selectedTool.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-sm text-primary hover:underline"
                  >
                    View provider pricing <ExternalLink className="size-3" />
                  </a>
                </div>
              </details>
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
            </div>
          )}
          {error && !selectedPlan && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
        {selectedPlan && (
          <SheetFooter className="border-t px-6 py-4">
            <Button onClick={createSubscription} disabled={saving || (needsCustomPrice && !customPrice) || (cadence === "custom" && !advanced.billingCycleDays)}>
              {saving && <Loader2 className="animate-spin" />} Add {seats}{" "}
              {seats === 1 ? "seat" : "seats"}
            </Button>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}

function AdvancedField({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  const id = `advanced-${label.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}`;
  return (
    <div>
      <Label htmlFor={id} className="mb-2">
        {label}
      </Label>
      <Input
        id={id}
        type={type}
        min={type === "number" ? 0 : undefined}
        step={type === "number" ? "0.01" : undefined}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
