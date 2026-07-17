"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { ArrowUpRight, Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { EffectiveSignalsPolicy } from "@/lib/signals/service";
import { cn } from "@/lib/utils";

export function SignalsSettingsCard({ initialPolicy }: { initialPolicy: EffectiveSignalsPolicy }) {
  const [enabled, setEnabled] = useState(initialPolicy.enabled);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function save(nextEnabled: boolean) {
    setError(null);
    startTransition(async () => {
      const response = await fetch("/api/signals/policy", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: nextEnabled }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        policy?: EffectiveSignalsPolicy;
      };
      if (!response.ok || !body.policy) {
        setError(body.error ?? "Could not update Signals");
        return;
      }
      setEnabled(body.policy.enabled);
      setConfirmOpen(false);
    });
  }

  return (
    <>
      <section className="border bg-card p-5 sm:p-6">
        <div className="mb-2">
          <h2 className="text-lg font-semibold tracking-tight">Signals</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Observe AI-adjacent app/domain flows. Content is never collected. Fine-tune retention and
            exclusions under{" "}
            <Link href="/signals/settings" className="underline underline-offset-2 hover:text-foreground">
              Signals boundaries
              <ArrowUpRight className="ml-0.5 inline size-3.5 align-text-top" />
            </Link>
            .
          </p>
        </div>

        {error ? (
          <Alert variant="destructive" className="mb-4 rounded-none">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <div className="flex flex-col gap-4 border-t border-border/70 py-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <h3 className="text-base font-semibold tracking-tight">Collection</h3>
              <Badge
                variant="outline"
                className={cn(
                  "rounded-none text-[0.65rem] uppercase tracking-[0.08em]",
                  enabled
                    ? "border-success/30 bg-success/10 text-success"
                    : "border-border bg-muted text-muted-foreground",
                )}
              >
                {enabled ? "On" : "Off"}
              </Badge>
            </div>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              {enabled
                ? "Enrolled agents upload app/domain flow metadata."
                : "Agents won’t send Signals until you turn this on."}
            </p>
          </div>
          <div className="shrink-0">
            {enabled ? (
              <Button
                type="button"
                variant="outline"
                className="rounded-none gap-2"
                disabled={pending}
                onClick={() => save(false)}
              >
                {pending ? <Loader2 className="size-4 animate-spin" /> : null}
                Turn off
              </Button>
            ) : (
              <Button
                type="button"
                className="rounded-none"
                disabled={pending}
                onClick={() => setConfirmOpen(true)}
              >
                Turn on
              </Button>
            )}
          </div>
        </div>
      </section>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="rounded-none">
          <DialogHeader>
            <DialogTitle>Turn on Signals?</DialogTitle>
            <DialogDescription>
              Agents will start uploading app/domain flow metadata. Content is never collected.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              className="rounded-none"
              disabled={pending}
              onClick={() => setConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="rounded-none gap-2"
              disabled={pending}
              onClick={() => save(true)}
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              Turn on
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
