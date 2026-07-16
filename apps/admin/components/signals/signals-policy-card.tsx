"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { ArrowUpRight, Loader2, X } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type SignalsPolicy = {
  enabled: boolean;
  retentionDays: number;
  collectionMode: "app_domain";
  excludedApps: string[];
  excludedDomains: string[];
};

const SEES = ["Foreground app", "Inferred domain", "AI tool", "Duration", "Before / after flow"];
const NEVER = ["Screenshots", "Prompts", "Page contents", "Keystrokes", "Clipboard", "Full URLs"];
const RETENTION_OPTIONS = [30, 90, 180] as const;

function normalizeRetention(days: number) {
  if ((RETENTION_OPTIONS as readonly number[]).includes(days)) return days;
  return 90;
}

function sameList(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  return a.every((item, index) => item === b[index]);
}

function ExclusionList({
  id,
  label,
  items,
  placeholder,
  onChange,
}: {
  id: string;
  label: string;
  items: string[];
  placeholder: string;
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState("");

  function addItem() {
    const value = draft.trim();
    if (!value) return;
    if (items.some((item) => item.toLowerCase() === value.toLowerCase())) {
      setDraft("");
      return;
    }
    onChange([...items, value]);
    setDraft("");
  }

  return (
    <div className="space-y-3">
      <Label htmlFor={id}>{label}</Label>
      {items.length ? (
        <ul className="flex flex-wrap gap-2">
          {items.map((item) => (
            <li
              key={item}
              className="inline-flex max-w-full items-center gap-1.5 border border-border bg-muted px-2.5 py-1 text-sm"
            >
              <span className="truncate">{item}</span>
              <button
                type="button"
                className="shrink-0 text-muted-foreground hover:text-foreground"
                aria-label={`Remove ${item}`}
                onClick={() => onChange(items.filter((current) => current !== item))}
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">None yet.</p>
      )}
      <div className="flex gap-2">
        <Input
          id={id}
          value={draft}
          placeholder={placeholder}
          className="rounded-none"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addItem();
            }
          }}
        />
        <Button
          type="button"
          variant="outline"
          className="rounded-none"
          disabled={!draft.trim()}
          onClick={addItem}
        >
          Add
        </Button>
      </div>
    </div>
  );
}

export function SignalsPolicyCard({ initialPolicy }: { initialPolicy: SignalsPolicy }) {
  const [policy, setPolicy] = useState(initialPolicy);
  const [excludedApps, setExcludedApps] = useState(initialPolicy.excludedApps);
  const [excludedDomains, setExcludedDomains] = useState(initialPolicy.excludedDomains);
  const [retentionDays, setRetentionDays] = useState(normalizeRetention(initialPolicy.retentionDays));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const boundariesDirty =
    retentionDays !== normalizeRetention(policy.retentionDays) ||
    !sameList(excludedApps, policy.excludedApps) ||
    !sameList(excludedDomains, policy.excludedDomains);

  function resetBoundaries() {
    setSaved(false);
    setExcludedApps(policy.excludedApps);
    setExcludedDomains(policy.excludedDomains);
    setRetentionDays(normalizeRetention(policy.retentionDays));
  }

  function save(overrides?: {
    enabled?: boolean;
    retentionDays?: number;
    excludedApps?: string[];
    excludedDomains?: string[];
  }) {
    const nextEnabled = overrides?.enabled ?? policy.enabled;
    const nextRetention = overrides?.retentionDays ?? retentionDays;
    const nextApps = overrides?.excludedApps ?? excludedApps;
    const nextDomains = overrides?.excludedDomains ?? excludedDomains;

    setError(null);
    setSaved(false);
    startTransition(async () => {
      const response = await fetch("/api/signals/policy", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: nextEnabled,
          retentionDays: nextRetention,
          collectionMode: "app_domain",
          excludedApps: nextApps,
          excludedDomains: nextDomains,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(body.error ?? "Could not update Signals policy");
        return;
      }
      setPolicy(body.policy);
      setExcludedApps(body.policy.excludedApps);
      setExcludedDomains(body.policy.excludedDomains);
      setRetentionDays(normalizeRetention(body.policy.retentionDays));
      setSaved(true);
      setConfirmOpen(false);
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
              policy.enabled
                ? "border-success/30 bg-success/10 text-success"
                : "border-border bg-muted text-muted-foreground",
            )}
          >
            {policy.enabled ? "On" : "Off"}
          </Badge>
          <p className="text-sm leading-6 text-muted-foreground">
            {policy.enabled
              ? `Enrolled agents are observing AI-adjacent flows · kept ${policy.retentionDays} days.`
              : "Agents won’t send Signals until you turn this on."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {policy.enabled ? (
            <>
              <Button
                type="button"
                variant="outline"
                className="rounded-none"
                disabled={pending}
                onClick={() => save({ enabled: false })}
              >
                {pending ? <Loader2 className="size-4 animate-spin" /> : null}
                Turn off
              </Button>
            </>
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

      {!policy.enabled ? (
        <p className="mb-10 text-sm text-foreground">Example: Linear → Claude → Cursor</p>
      ) : null}

      <div className="mb-10 grid gap-8 sm:grid-cols-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">Sees</p>
          <ul className="mt-3 space-y-2">
            {SEES.map((item) => (
              <li key={item} className="text-sm leading-6">
                {item}
              </li>
            ))}
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
        <div className="mb-4 border-b pb-3">
          <h2 className="text-lg font-semibold tracking-tight">Boundaries</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            How long sessions are kept, and what agents should ignore.
          </p>
        </div>

        <div className="space-y-8">
          <div className="space-y-2">
            <Label htmlFor="signals-retention">Retention</Label>
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

          <div className="grid gap-8 lg:grid-cols-2">
            <ExclusionList
              id="signals-excluded-apps"
              label="Excluded apps"
              items={excludedApps}
              placeholder="e.g. 1Password"
              onChange={(next) => {
                setSaved(false);
                setExcludedApps(next);
              }}
            />
            <ExclusionList
              id="signals-excluded-domains"
              label="Excluded domains"
              items={excludedDomains}
              placeholder="e.g. paypal.com"
              onChange={(next) => {
                setSaved(false);
                setExcludedDomains(next);
              }}
            />
          </div>

          {boundariesDirty || saved ? (
            <div className="flex flex-wrap items-center gap-3 border-t pt-4">
              <Button
                type="button"
                className="rounded-none"
                disabled={pending || !boundariesDirty}
                onClick={() => save()}
              >
                {pending ? <Loader2 className="size-4 animate-spin" /> : null}
                Save
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="rounded-none"
                disabled={pending || !boundariesDirty}
                onClick={resetBoundaries}
              >
                Cancel
              </Button>
              {saved && !boundariesDirty ? (
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
              className="rounded-none"
              disabled={pending}
              onClick={() => save({ enabled: true })}
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
