"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Panel } from "@/components/panel";
import { useInvalidateAppData } from "@/lib/api/client";

/** Shown after Lemon checkout redirect (`?upgraded=1`) until Team status lands. */
export function SubscriptionUpgradedBanner({ isTeam }: { isTeam: boolean }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const invalidateAppData = useInvalidateAppData();
  const upgraded = searchParams.get("upgraded") === "1";
  const [visible, setVisible] = useState(upgraded);

  useEffect(() => {
    if (!upgraded) return;
    setVisible(true);
    if (isTeam) {
      const url = new URL(window.location.href);
      url.searchParams.delete("upgraded");
      router.replace(url.pathname + url.search);
      const timeout = window.setTimeout(() => setVisible(false), 2500);
      return () => window.clearTimeout(timeout);
    }
    const interval = window.setInterval(() => {
      void invalidateAppData();
      router.refresh();
    }, 2000);
    return () => window.clearInterval(interval);
  }, [upgraded, isTeam, router, invalidateAppData]);

  if (!visible) return null;

  return (
    <Panel padded={false} className="mb-6 border-border px-4 py-3 text-sm">
      {isTeam
        ? "Team subscription is active."
        : "Subscription updating… This page refreshes until billing confirms Team."}
    </Panel>
  );
}
