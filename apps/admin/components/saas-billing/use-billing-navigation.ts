"use client";

import { useState } from "react";

type BillingDestination = "checkout" | "portal";

const billingRequest = {
  checkout: {
    endpoint: "/api/billing/checkout",
    fallbackError: "Checkout unavailable",
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    } satisfies RequestInit,
  },
  portal: {
    endpoint: "/api/billing/portal",
    fallbackError: "Billing portal unavailable",
    init: { method: "POST" } satisfies RequestInit,
  },
} as const;

export function useBillingNavigation() {
  const [pendingDestination, setPendingDestination] = useState<BillingDestination | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function open(destination: BillingDestination) {
    const request = billingRequest[destination];
    setPendingDestination(destination);
    setError(null);

    try {
      const response = await fetch(request.endpoint, request.init);
      const data = (await response.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!response.ok || !data.url) {
        throw new Error(data.error?.trim() || request.fallbackError);
      }
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : request.fallbackError);
      setPendingDestination(null);
    }
  }

  return {
    error,
    loading: pendingDestination !== null,
    pendingDestination,
    openCheckout: () => open("checkout"),
    openPortal: () => open("portal"),
  };
}
