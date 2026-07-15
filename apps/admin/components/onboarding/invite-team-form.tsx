"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, Clipboard, Link2, Loader2, Mail, RefreshCw, X } from "lucide-react";
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

type AllowlistRow = { email: string; createdAt: string };

type ConnectCommandRow = {
  email: string;
  command: string;
  expiresAt?: string;
};

function parseEmails(raw: string) {
  return [...new Set(raw.split(/[\s,;]+/).map((item) => item.trim().toLowerCase()).filter(Boolean))];
}

export function InviteTeamForm({ onInvited }: { onInvited?: (result: InviteResult) => void }) {
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [linkExists, setLinkExists] = useState(false);
  const [allowlist, setAllowlist] = useState<AllowlistRow[]>([]);
  const [loadingLink, setLoadingLink] = useState(true);
  const [rotating, setRotating] = useState(false);
  const [value, setValue] = useState("");
  const [emails, setEmails] = useState<string[]>([]);
  const [sendEmail, setSendEmail] = useState(true);
  const [adding, setAdding] = useState(false);
  const [resending, setResending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successNote, setSuccessNote] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [advancedLoading, setAdvancedLoading] = useState(false);
  const [commands, setCommands] = useState<ConnectCommandRow[]>([]);

  const draftCount = useMemo(
    () => parseEmails(value).filter((email) => emailPattern.test(email)).length,
    [value],
  );
  const pendingCount = emails.length + draftCount;
  const canAdd = pendingCount > 0 && !adding;

  const loadLink = useCallback(async (createIfMissing = true) => {
    setLoadingLink(true);
    setError(null);
    const get = await fetch("/api/team/invite-link");
    const getData = await get.json().catch(() => ({}));
    if (!get.ok) {
      setLoadingLink(false);
      setError(getData.error ?? "Unable to load invite link.");
      return;
    }
    if (getData.url) {
      setLinkExists(true);
      setInviteUrl(getData.url);
      setAllowlist(getData.allowlist ?? []);
      setLoadingLink(false);
      return;
    }
    if (getData.link) {
      setLinkExists(true);
      setInviteUrl(null);
      setAllowlist(getData.allowlist ?? []);
      setLoadingLink(false);
      return;
    }
    if (!createIfMissing) {
      setInviteUrl(null);
      setAllowlist([]);
      setLoadingLink(false);
      return;
    }
    const create = await fetch("/api/team/invite-link", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    const createData = await create.json().catch(() => ({}));
    setLoadingLink(false);
    if (!create.ok) {
      setError(createData.error ?? "Unable to create invite link.");
      return;
    }
    setInviteUrl(createData.url ?? null);
    setLinkExists(Boolean(createData.link));
    setAllowlist(createData.allowlist ?? []);
  }, []);

  useEffect(() => {
    void loadLink(true);
  }, [loadLink]);

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

  async function copy(key: string, text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    window.setTimeout(() => setCopied(null), 1600);
  }

  async function rotateLink() {
    setRotating(true);
    setError(null);
    const response = await fetch("/api/team/invite-link", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rotate: true }),
    });
    const data = await response.json().catch(() => ({}));
    setRotating(false);
    if (!response.ok) {
      setError(data.error ?? "Unable to rotate invite link.");
      return;
    }
    setInviteUrl(data.url ?? null);
    setLinkExists(true);
    setAllowlist(data.allowlist ?? []);
    setSuccessNote("Invite link rotated. Share the new link.");
  }

  async function addPeople(event: React.FormEvent) {
    event.preventDefault();
    const fromDraft = parseEmails(value).filter((email) => emailPattern.test(email));
    const all = [...new Set([...emails, ...fromDraft])].slice(0, 100);
    if (!all.length) {
      setError("Add at least one work email.");
      return;
    }
    setAdding(true);
    setError(null);
    setSuccessNote(null);
    const response = await fetch("/api/team/invite-link", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ emails: all, sendEmail }),
    });
    const data = await response.json().catch(() => ({}));
    setAdding(false);
    if (!response.ok) {
      setError(data.error ?? "Unable to add people.");
      return;
    }
    setAllowlist(data.allowlist ?? []);
    if (data.url) setInviteUrl(data.url);
    const added = (data.added ?? []) as AllowlistRow[];
    const emailResults = (data.emailResults ?? []) as Array<{ email: string; status: string }>;
    const emailed = emailResults.filter((row) => row.status === "sent").length;
    const failedMail = emailResults.filter((row) => row.status === "email_failed").length;
    const names = added.map((row) => row.email);
    const base =
      names.length === 1 ? `Added ${names[0]}.` : `Added ${names.length} people.`;
    const mailNote = sendEmail
      ? emailed
        ? ` Email sent to ${emailed}.`
        : failedMail
          ? " Email delivery failed — share the link manually."
          : ""
      : " They can use the invite link whenever you share it.";
    setSuccessNote(`${base}${mailNote}`);
    if (failedMail) {
      setError(`${failedMail} invitation email${failedMail === 1 ? "" : "s"} failed to send.`);
    }
    setEmails([]);
    setValue("");
    setCommands([]);
    onInvited?.({ sent: names.length, failed: failedMail });
  }

  async function removeAllowlisted(email: string) {
    const response = await fetch(`/api/team/invite-link?email=${encodeURIComponent(email)}`, {
      method: "DELETE",
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(data.error ?? "Unable to remove email.");
      return;
    }
    setAllowlist(data.allowlist ?? []);
  }

  async function resendEmail(email: string) {
    setResending(email);
    setError(null);
    const response = await fetch("/api/team/invite-link", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await response.json().catch(() => ({}));
    setResending(null);
    if (!response.ok) {
      setError(data.error ?? "Unable to send email.");
      return;
    }
    const result = (data.emailResults ?? [])[0] as { status?: string } | undefined;
    if (result?.status === "sent") {
      setSuccessNote(`Instructions emailed to ${email}.`);
    } else {
      setError(`Could not email ${email}.`);
    }
  }

  async function loadAdvancedCommands() {
    const emailsForCli = allowlist.map((row) => row.email);
    if (!emailsForCli.length) {
      setError("Add people to the allowlist before generating CLI commands.");
      return;
    }
    setAdvancedLoading(true);
    setError(null);
    const response = await fetch("/api/team/connect-invite", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ emails: emailsForCli }),
    });
    const data = await response.json().catch(() => ({}));
    setAdvancedLoading(false);
    if (!response.ok) {
      setError(data.error ?? "Unable to create CLI commands.");
      return;
    }
    const results = (data.results ?? []) as Array<{
      status: string;
      email: string;
      command?: string;
      expiresAt?: string;
    }>;
    setCommands(
      results
        .filter((item) => item.status === "ok" && item.command)
        .map((item) => ({
          email: item.email,
          command: item.command!,
          expiresAt: item.expiresAt,
        })),
    );
  }

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div>
          <p className="text-sm font-medium">Invite link</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Only allowlisted email addresses can redeem this link. It is shown once and stored only as a hash.
          </p>
        </div>
        {loadingLink ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Preparing invite link…
          </div>
        ) : inviteUrl ? (
          <div className="space-y-2">
            <div className="flex gap-2">
              <div className="min-w-0 flex-1 overflow-hidden border bg-muted/30 px-3 py-2 font-mono text-xs leading-5">
                <span className="break-all">{inviteUrl}</span>
              </div>
              <Button type="button" onClick={() => void copy("link", inviteUrl)}>
                {copied === "link" ? <Check className="size-4" /> : <Clipboard className="size-4" />}
                {copied === "link" ? "Copied" : "Copy"}
              </Button>
            </div>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => void rotateLink()}
              disabled={rotating}
            >
              {rotating ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
              Rotate link
            </button>
          </div>
        ) : (
          <Button
            type="button"
            variant="outline"
            onClick={() => void (linkExists ? rotateLink() : loadLink(true))}
            disabled={rotating}
          >
            <Link2 className="size-4" />
            {linkExists ? "Rotate and reveal new link" : "Generate invite link"}
          </Button>
        )}
      </section>

      <section className="space-y-3">
        <div>
          <p className="text-sm font-medium">Notify people (optional)</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Each email receives its own short-lived, single-use invite. Add addresses before sharing the team link.
          </p>
        </div>

        {allowlist.length > 0 && (
          <ul className="space-y-2">
            {allowlist.map((row) => (
              <li
                key={row.email}
                className="flex items-center justify-between gap-2 border bg-muted/20 px-3 py-2"
              >
                <span className="truncate text-sm">{row.email}</span>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={resending === row.email}
                    onClick={() => void resendEmail(row.email)}
                    aria-label={`Email instructions to ${row.email}`}
                  >
                    {resending === row.email ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Mail className="size-3.5" />
                    )}
                    Email
                  </Button>
                  <button
                    type="button"
                    aria-label={`Remove ${row.email}`}
                    className="rounded-sm p-1.5 opacity-70 hover:opacity-100"
                    onClick={() => void removeAllowlisted(row.email)}
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={addPeople} className="space-y-3" aria-busy={adding}>
          <Label htmlFor="invite-emails" className="sr-only">
            Work emails
          </Label>
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
              className="min-h-16 resize-none border-0 shadow-none focus-visible:ring-0"
            />
            <div className="flex flex-col gap-3 border-t bg-muted/20 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
              <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  className="size-3.5 accent-foreground"
                  checked={sendEmail}
                  onChange={(event) => setSendEmail(event.target.checked)}
                />
                Email instructions (link + install steps)
              </label>
              <Button type="submit" size="sm" disabled={!canAdd}>
                {adding ? <Loader2 className="animate-spin" /> : sendEmail ? <Mail /> : null}
                {adding
                  ? "Adding…"
                  : sendEmail
                    ? pendingCount > 1
                      ? `Add & email ${pendingCount}`
                      : "Add & email"
                    : pendingCount > 1
                      ? `Add ${pendingCount} people`
                      : "Add people"}
              </Button>
            </div>
          </div>
        </form>

        {successNote && (
          <Alert>
            <AlertDescription>{successNote}</AlertDescription>
          </Alert>
        )}
      </section>

      <section className="border-t pt-4">
        <button
          type="button"
          className="flex w-full items-center justify-between text-left text-sm font-medium"
          onClick={() => {
            const next = !advancedOpen;
            setAdvancedOpen(next);
            if (next && !commands.length && allowlist.length) {
              void loadAdvancedCommands();
            }
          }}
        >
          Prefer CLI?
          <ChevronDown className={`size-4 transition ${advancedOpen ? "rotate-180" : ""}`} />
        </button>
        {advancedOpen && (
          <div className="mt-3 space-y-3">
            <p className="text-xs text-muted-foreground">
              Per-person connect commands for Terminal. Most teammates should use the invite link instead.
            </p>
            {advancedLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Preparing commands…
              </div>
            ) : commands.length ? (
              <ul className="space-y-3">
                {commands.map((row) => (
                  <li key={row.email} className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium">{row.email}</p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void copy(row.email, row.command)}
                      >
                        {copied === row.email ? <Check className="size-4" /> : <Clipboard className="size-4" />}
                        {copied === row.email ? "Copied" : "Copy"}
                      </Button>
                    </div>
                    <div className="overflow-hidden border border-zinc-800 bg-zinc-950 p-3 font-mono text-[0.7rem] leading-5 text-zinc-100">
                      <code className="break-all">{row.command}</code>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!allowlist.length}
                onClick={() => void loadAdvancedCommands()}
              >
                Generate CLI commands
              </Button>
            )}
          </div>
        )}
      </section>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
