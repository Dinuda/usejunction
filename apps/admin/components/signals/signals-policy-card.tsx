"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { ArrowUpRight, Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { userFacingError } from "@/lib/errors/user-facing";

type SignalsPolicy = {
  enabled: boolean;
  retentionDays: number;
  collectionMode: "app_domain";
  excludedApps: string[];
  excludedDomains: string[];
  workExtractionEnabled?: boolean;
};

const NEVER = [
  "Screenshots",
  "Full chat transcripts",
  "Page contents",
  "Keystrokes",
  "Clipboard",
  "Full URLs",
  "File contents",
];
const WORK_SEES = [
  "User asks (clipped)",
  "Change summaries when available",
  "Conversation titles / summaries",
  "Models",
  "Agent modes",
  "Tool-call kinds",
  "File touches (basenames)",
];
const RETENTION_OPTIONS = [30, 90, 180] as const;

function normalizeRetention(days: number) {
  if ((RETENTION_OPTIONS as readonly number[]).includes(days)) return days;
  return 90;
}

export function SignalsPolicyCard({ initialPolicy }: { initialPolicy: SignalsPolicy }) {
  const [policy, setPolicy] = useState(initialPolicy);
  const [retentionDays, setRetentionDays] = useState(normalizeRetention(initialPolicy.retentionDays));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const retentionDirty = retentionDays !== normalizeRetention(policy.retentionDays);

  function resetRetention() {
    setSaved(false);
    setRetentionDays(normalizeRetention(policy.retentionDays));
  }

  function save(nextRetention = retentionDays) {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const response = await fetch("/api/signals/policy", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // Classic app/domain sampling stays off for this release.
          enabled: false,
          retentionDays: nextRetention,
          collectionMode: "app_domain",
          workExtractionEnabled: policy.workExtractionEnabled ?? false,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(userFacingError(body.error, "Could not update Signals policy"));
        return;
      }
      setPolicy(body.policy);
      setRetentionDays(normalizeRetention(body.policy.retentionDays));
      setSaved(true);
    });
  }

  return (
    <>
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b pb-6">
        <div className="flex flex-wrap items-center gap-3">
          <Badge
            variant="outline"
            className={cn(
              "rounded-none text-[0.65rem] uppercase tracking-[0.08em]",
              policy.workExtractionEnabled
                ? "border-success/30 bg-success/10 text-success"
                : "border-border bg-muted text-muted-foreground",
            )}
          >
            {policy.workExtractionEnabled ? "Work on" : "Work off"}
          </Badge>
          <p className="text-sm leading-6 text-muted-foreground">
            {policy.workExtractionEnabled
              ? `Coding-tool work is collecting · kept ${policy.retentionDays} days.`
              : "Turn on work extraction under Settings → Signals to start collecting."}
          </p>
        </div>
        <Button asChild variant="outline" className="rounded-none shrink-0">
          <Link href="/settings">
            Settings → Signals
            <ArrowUpRight className="ml-1 size-3.5" />
          </Link>
        </Button>
      </div>

      <div className="mb-10 grid gap-8 sm:grid-cols-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">Sees</p>
          <ul className="mt-3 space-y-2">
            {policy.workExtractionEnabled ? (
              WORK_SEES.map((item) => (
                <li key={item} className="text-sm leading-6">
                  {item}
                </li>
              ))
            ) : (
              <li className="text-sm leading-6 text-muted-foreground">
                Nothing until work extraction is on.
              </li>
            )}
          </ul>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">Never</p>
          <ul className="mt-3 space-y-2">
            {NEVER.map((item) => (
              <li key={item} className="text-sm leading-6 text-muted-foreground">
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <section>
        <div className="mb-6">
          <h2 className="text-lg font-semibold tracking-tight">Retention</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            How long extracted work sessions are kept for this workspace.
          </p>
        </div>

        <div className="space-y-8">
          <div className="space-y-2">
            <Label htmlFor="signals-retention">Keep for</Label>
            <Select
              value={String(retentionDays)}
              onValueChange={(value) => {
                setSaved(false);
                setRetentionDays(Number(value));
              }}
            >
              <SelectTrigger id="signals-retention" className="w-full max-w-xs rounded-none">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-none">
                {RETENTION_OPTIONS.map((days) => (
                  <SelectItem key={days} value={String(days)} className="rounded-none">
                    {days} days
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {retentionDirty || saved ? (
            <div className="flex flex-wrap items-center gap-3 border-t pt-4">
              <Button
                type="button"
                className="rounded-none"
                disabled={pending || !retentionDirty}
                onClick={() => save()}
              >
                {pending ? <Loader2 className="size-4 animate-spin" /> : null}
                Save
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="rounded-none"
                disabled={pending || !retentionDirty}
                onClick={resetRetention}
              >
                Cancel
              </Button>
              {saved && !retentionDirty ? (
                <p role="status" aria-live="polite" className="text-xs text-muted-foreground">
                  Saved.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>

      {error ? (
        <Alert variant="destructive" className="mt-8 rounded-none">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
    </>
  );
}
