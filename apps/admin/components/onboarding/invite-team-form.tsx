"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Clipboard, Link2, Loader2, Mail, RefreshCw, Send, X } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { userFacingError } from "@/lib/errors/user-facing";
import { cn } from "@/lib/utils";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type InviteResult = {
  sent: number;
  failed: number;
};

type AllowlistRow = { email: string; createdAt: string };

function parseEmails(raw: string) {
  return [...new Set(raw.split(/[\s,;]+/).map((item) => item.trim().toLowerCase()).filter(Boolean))];
}

function isInviteLinkStale(link: { expiresAt?: string | Date | null; enabled?: boolean } | null | undefined) {
  if (!link) return true;
  if (link.enabled === false) return true;
  if (!link.expiresAt) return false;
  return new Date(link.expiresAt).getTime() <= Date.now();
}

export function InviteTeamForm({
  onInvited,
  variant = "default",
}: {
  onInvited?: (result: InviteResult) => void;
  /** Dashboard setup card — same invite features, tighter layout matching connect machine. */
  variant?: "default" | "dashboard";
}) {
  const dashboard = variant === "dashboard";
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [linkMeta, setLinkMeta] = useState<{ expiresAt: string | null; enabled: boolean } | null>(null);
  const [allowlist, setAllowlist] = useState<AllowlistRow[]>([]);
  const [loadingLink, setLoadingLink] = useState(true);
  const [copyingLink, setCopyingLink] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [value, setValue] = useState("");
  const [emails, setEmails] = useState<string[]>([]);
  const [sendEmail, setSendEmail] = useState(true);
  const [adding, setAdding] = useState(false);
  const [resending, setResending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successNote, setSuccessNote] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const draftCount = useMemo(
    () => parseEmails(value).filter((email) => emailPattern.test(email)).length,
    [value],
  );
  const pendingCount = emails.length + draftCount;
  const canAdd = pendingCount > 0 && !adding;

  function applyLinkPayload(data: {
    url?: string | null;
    allowlist?: AllowlistRow[];
    link?: { expiresAt?: string | Date | null; enabled?: boolean } | null;
  }) {
    setInviteUrl(data.url ?? null);
    setAllowlist(data.allowlist ?? []);
    if (data.link) {
      setLinkMeta({
        expiresAt: data.link.expiresAt ? new Date(data.link.expiresAt).toISOString() : null,
        enabled: data.link.enabled !== false,
      });
    } else if (!data.url) {
      setLinkMeta(null);
    }
  }

  const loadLink = useCallback(async (createIfMissing = true) => {
    setLoadingLink(true);
    setError(null);
    const get = await fetch("/api/team/invite-link");
    const getData = await get.json().catch(() => ({}));
    if (!get.ok) {
      setLoadingLink(false);
      setError(userFacingError(getData.error, "Unable to load invite link."));
      return;
    }
    if (getData.url && !isInviteLinkStale(getData.link)) {
      applyLinkPayload(getData);
      setLoadingLink(false);
      return;
    }
    if (!createIfMissing) {
      applyLinkPayload({ url: null, allowlist: [], link: null });
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
      setError(userFacingError(createData.error, "Unable to create invite link."));
      return;
    }
    applyLinkPayload(createData);
  }, []);

  useEffect(() => {
    void loadLink(true);
  }, [loadLink]);

  const ensureFreshInviteUrl = useCallback(async () => {
    if (inviteUrl && !isInviteLinkStale(linkMeta)) return inviteUrl;

    const response = await fetch("/api/team/invite-link", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.url) {
      setError(userFacingError(data.error, "Unable to refresh invite link."));
      return null;
    }
    applyLinkPayload(data);
    return data.url as string;
  }, [inviteUrl, linkMeta]);

  async function copyInviteLink() {
    setCopyingLink(true);
    setError(null);
    try {
      const url = await ensureFreshInviteUrl();
      if (!url) return;
      await navigator.clipboard.writeText(url);
      setCopied("link");
      window.setTimeout(() => setCopied(null), 1600);
    } finally {
      setCopyingLink(false);
    }
  }

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
      setError(userFacingError(data.error, "Unable to rotate invite link."));
      return;
    }
    applyLinkPayload(data);
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
      body: JSON.stringify({ emails: all, sendEmail: dashboard ? true : sendEmail }),
    });
    const data = await response.json().catch(() => ({}));
    setAdding(false);
    if (!response.ok) {
      setError(userFacingError(data.error, "Unable to add people."));
      return;
    }
    setAllowlist(data.allowlist ?? []);
    if (data.url) applyLinkPayload({ ...data, allowlist: data.allowlist ?? [] });
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
    onInvited?.({ sent: names.length, failed: failedMail });
  }

  async function removeAllowlisted(email: string) {
    const response = await fetch(`/api/team/invite-link?email=${encodeURIComponent(email)}`, {
      method: "DELETE",
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(userFacingError(data.error, "Unable to remove email."));
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
      setError(userFacingError(data.error, "Unable to send email."));
      return;
    }
    const result = (data.emailResults ?? [])[0] as { status?: string } | undefined;
    if (result?.status === "sent") {
      setSuccessNote(`Instructions emailed to ${email}.`);
    } else {
      setError(`Could not email ${email}.`);
    }
  }

  const notifyForm = (
    <form onSubmit={addPeople} className="space-y-3" aria-busy={adding}>
      <Label htmlFor={dashboard ? "dashboard-invite-emails" : "invite-emails"} className="sr-only">
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
          id={dashboard ? "dashboard-invite-emails" : "invite-emails"}
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            if (error) setError(null);
          }}
          onKeyDown={onKeyDown}
          placeholder={emails.length ? "Add another…" : "alice@acme.com, bob@acme.com"}
          className={cn("resize-none border-0 shadow-none focus-visible:ring-0", dashboard ? "min-h-14" : "min-h-16")}
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
  );

  const allowlistRows =
    allowlist.length > 0 ? (
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
    ) : null;

  if (dashboard) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-5">
        <section className="space-y-2">
          <Label htmlFor="dashboard-invite-emails" className="text-sm font-medium">
            Email addresses
          </Label>
          <form
            id="dashboard-invite-form"
            onSubmit={addPeople}
            className="space-y-3"
            aria-busy={adding}
          >
            <div className="overflow-hidden rounded-none border bg-background focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50">
              {emails.length > 0 && (
                <div className="flex flex-wrap gap-1.5 border-b px-3 py-2.5">
                  {emails.map((email) => (
                    <Badge key={email} variant="secondary" className="gap-1.5 rounded-none font-normal">
                      {email}
                      <button
                        type="button"
                        aria-label={`Remove ${email}`}
                        className="opacity-70 hover:opacity-100"
                        onClick={() => setEmails((current) => current.filter((item) => item !== email))}
                      >
                        <X className="size-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
              <Textarea
                id="dashboard-invite-emails"
                value={value}
                onChange={(event) => {
                  setValue(event.target.value);
                  if (error) setError(null);
                }}
                onKeyDown={onKeyDown}
                placeholder={emails.length ? "Add another…" : "Ex. ellis@acme.com, maria@acme.com"}
                className="min-h-[6.5rem] resize-none rounded-none border-0 shadow-none focus-visible:ring-0"
              />
            </div>
          </form>

          {allowlistRows}
        </section>

        {successNote ? (
          <Alert>
            <AlertDescription>{successNote}</AlertDescription>
          </Alert>
        ) : null}

        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-2">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 text-sm text-primary underline-offset-4 hover:underline disabled:opacity-50"
            disabled={loadingLink || copyingLink}
            onClick={() => void copyInviteLink()}
          >
            {loadingLink || copyingLink ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : copied === "link" ? (
              <Check className="size-3.5" />
            ) : (
              <Link2 className="size-3.5" />
            )}
            {copied === "link" ? "Copied" : "Copy invite link"}
          </button>

          <Button
            type="submit"
            form="dashboard-invite-form"
            size="sm"
            disabled={!canAdd}
            className="h-9 min-w-[10.5rem] gap-1.5 rounded-none bg-foreground px-6 text-background shadow-none hover:bg-foreground/90"
          >
            {adding ? <Loader2 className="animate-spin" /> : <Send />}
            {adding ? "Sending…" : "Send"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div>
          <p className="text-sm font-medium">Invite link</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Anyone with this link can sign up or sign in and connect their machine.
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
              <Button type="button" disabled={copyingLink} onClick={() => void copyInviteLink()}>
                {copyingLink ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : copied === "link" ? (
                  <Check className="size-4" />
                ) : (
                  <Clipboard className="size-4" />
                )}
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
          <Button type="button" variant="outline" onClick={() => void loadLink(true)}>
            <Link2 className="size-4" />
            Generate invite link
          </Button>
        )}
      </section>

      <section className="space-y-3">
        <div>
          <p className="text-sm font-medium">Notify people (optional)</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Email teammates the invite link and install steps, or just copy the link above and share it yourself.
          </p>
        </div>
        {allowlistRows}
        {notifyForm}
        {successNote ? (
          <Alert>
            <AlertDescription>{successNote}</AlertDescription>
          </Alert>
        ) : null}
      </section>


      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
