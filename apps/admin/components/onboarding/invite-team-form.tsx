"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Mail, X } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type InviteResult = {
  sent: number;
  failed: number;
};

function parseEmails(raw: string) {
  return [...new Set(raw.split(/[\s,;]+/).map((item) => item.trim().toLowerCase()).filter(Boolean))];
}

export function InviteTeamForm({ onInvited }: { onInvited?: (result: InviteResult) => void }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [emails, setEmails] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const draftCount = useMemo(
    () => parseEmails(value).filter((email) => emailPattern.test(email)).length,
    [value],
  );
  const pendingCount = emails.length + draftCount;
  const canSend = pendingCount > 0 && !loading;

  function commitDraft() {
    const valid = parseEmails(value).filter((email) => emailPattern.test(email));
    if (!valid.length) return false;
    setEmails((current) => [...new Set([...current, ...valid])].slice(0, 100));
    setValue("");
    setError(null);
    return true;
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      if (!commitDraft() && value.trim()) {
        setError("Enter a valid work email.");
      }
    }
    if (event.key === "Backspace" && !value && emails.length) {
      setEmails((current) => current.slice(0, -1));
    }
  }

  async function send(event: React.FormEvent) {
    event.preventDefault();
    const fromDraft = parseEmails(value).filter((email) => emailPattern.test(email));
    const all = [...new Set([...emails, ...fromDraft])].slice(0, 100);
    if (!all.length) {
      setError("Add at least one work email.");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    const response = await fetch("/api/organizations/invites", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ emails: all, role: "developer" }),
    });
    const data = await response.json().catch(() => ({}));
    setLoading(false);
    if (!response.ok) {
      setError(data.error ?? "Unable to send invitations.");
      return;
    }
    const results = data.results ?? [];
    const sent = results.filter((item: { status: string }) => item.status === "sent").length;
    const failed = all.length - sent;
    const links = results
      .filter((item: { url?: string }) => item.url)
      .map((item: { invite?: { email: string }; url: string }) => `${item.invite?.email ?? "invite"}: ${item.url}`);
    setResult(
      failed
        ? `${sent} sent · ${failed} need attention.${links.length ? `\n${links.join("\n")}` : ""}`
        : `${sent} invite${sent === 1 ? "" : "s"} sent.${links.length ? `\n${links.join("\n")}` : ""}`,
    );
    setEmails([]);
    setValue("");
    onInvited?.({ sent, failed });
    router.refresh();
  }

  return (
    <form onSubmit={send} className="space-y-4" aria-busy={loading}>
      <div className="space-y-2">
        <Label htmlFor="invite-emails">Work emails</Label>
        <div className="overflow-hidden border bg-background focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50">
          {emails.length > 0 && (
            <div className="flex flex-wrap gap-1.5 border-b px-3 py-2.5">
              {emails.map((email) => (
                <Badge key={email} variant="secondary" className="gap-1.5 rounded-md font-normal">
                  {email}
                  <button
                    type="button"
                    aria-label={`Remove ${email}`}
                    className="rounded-sm opacity-70 hover:opacity-100"
                    onClick={() => setEmails((current) => current.filter((item) => item !== email))}
                  >
                    <X className="size-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
          <Textarea
            id="invite-emails"
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              if (error) setError(null);
            }}
            onKeyDown={onKeyDown}
            placeholder={emails.length ? "Add another…" : "alice@acme.com, bob@acme.com"}
            className="min-h-20 resize-none border-0 shadow-none focus-visible:ring-0"
          />
          <div className="flex flex-col gap-3 border-t bg-muted/20 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              Paste a list or press Enter. Up to 100.
            </p>
            <Button type="submit" size="sm" disabled={!canSend}>
              {loading ? <Loader2 className="animate-spin" /> : <Mail />}
              {loading ? "Sending…" : pendingCount > 1 ? `Send ${pendingCount} invites` : "Send invite"}
            </Button>
          </div>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {result && (
        <Alert>
          <Check />
          <AlertDescription className="whitespace-pre-wrap">{result}</AlertDescription>
        </Alert>
      )}

    </form>
  );
}
