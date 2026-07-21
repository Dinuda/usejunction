"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Mail } from "lucide-react";
import { Panel } from "@/components/panel";
import { SignalsSectionHeader } from "@/components/signals/signals-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { AudienceScope } from "@/lib/audience-scope";
import { useAppQuery } from "@/lib/api/client";
import type { SentReportKindFilter, SentReportListItem } from "@/lib/reports/sent-reports";

type ReportsListResponse = {
  audience: AudienceScope;
  items: SentReportListItem[];
  total: number;
  limit: number;
  offset: number;
};

type ReportPreviewResponse = {
  id: string;
  subject: string;
  html: string;
  sentAt: string;
  recipientEmail: string;
  recipientName: string | null;
};

function kindBadge(item: SentReportListItem) {
  if (item.kind === "personal") return "You · daily";
  return item.period === "week" ? "Team · weekly" : "Team · daily";
}

function formatSentAt(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function ReportEmailFrame({ html, title }: { html: string; title: string }) {
  return (
    <div className="overflow-hidden border border-border bg-[#f3f2ee]">
      <iframe title={title} srcDoc={html} className="h-[min(520px,55vh)] w-full border-0 bg-[#f3f2ee]" sandbox="" />
    </div>
  );
}

function ReportRow({
  item,
  active,
  onSelect,
}: {
  item: SentReportListItem;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full flex-col gap-1 border-b px-4 py-3 text-left transition last:border-b-0 hover:bg-muted/40",
        active && "bg-muted/60",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">{item.label || item.subject}</span>
        <Badge variant="secondary" className="font-normal">
          {kindBadge(item)}
        </Badge>
      </div>
      <span className="text-xs text-muted-foreground">{formatSentAt(item.sentAt)}</span>
    </button>
  );
}

export function SentReportsSection({ audience }: { audience: AudienceScope }) {
  const searchParams = useSearchParams();
  const deepDate = searchParams.get("date");
  const deepPeriod = searchParams.get("period");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogKind, setDialogKind] = useState<SentReportKindFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deepLinkHandled, setDeepLinkHandled] = useState(false);

  const scopeParam = audience === "you" ? "scope=you" : "scope=team";
  const listBase = `/api/app/activity/reports?${scopeParam}`;

  const inlineQuery = useAppQuery<ReportsListResponse>(
    ["app", "activity", "reports", audience, "inline"],
    `${listBase}&limit=5&offset=0&kind=all`,
  );

  const dialogQuery = useAppQuery<ReportsListResponse>(
    ["app", "activity", "reports", audience, "dialog", dialogKind],
    `${listBase}&limit=50&offset=0&kind=${dialogKind}`,
    { enabled: dialogOpen },
  );

  const dialogItems = dialogQuery.data?.items ?? [];
  const effectiveSelectedId = selectedId ?? dialogItems[0]?.id ?? null;

  const previewQuery = useAppQuery<ReportPreviewResponse>(
    ["app", "activity", "reports", "preview", effectiveSelectedId, audience],
    effectiveSelectedId
      ? `/api/app/activity/reports/${effectiveSelectedId}?${scopeParam}`
      : "/api/app/activity/reports/__idle__",
    { enabled: Boolean(effectiveSelectedId && dialogOpen) },
  );

  const items = inlineQuery.data?.items ?? [];
  const total = inlineQuery.data?.total ?? 0;
  const description =
    audience === "team"
      ? "Team and personal digests sent to your inbox. Switch filters or open You activity for personal-only."
      : "Daily usage emails sent to your inbox.";

  const filterKinds = useMemo(() => {
    if (audience === "team") return ["all", "org", "personal"] as SentReportKindFilter[];
    return ["all", "personal"] as SentReportKindFilter[];
  }, [audience]);

  const selectedPreview = useMemo(() => {
    if (previewQuery.data && previewQuery.data.id === effectiveSelectedId) return previewQuery.data;
    return null;
  }, [effectiveSelectedId, previewQuery.data]);

  // Deep link from email CTA: /activity?scope=…&date=…&period=…#reports
  useEffect(() => {
    if (deepLinkHandled || !deepDate || inlineQuery.isPending) return;
    const match = (inlineQuery.data?.items ?? []).find((item) => {
      if (item.localDate !== deepDate) return false;
      if (deepPeriod === "week") return item.period === "week";
      if (deepPeriod === "day") return item.period === "day";
      return true;
    });
    if (!match && (inlineQuery.data?.items.length ?? 0) === 0) {
      setDeepLinkHandled(true);
      return;
    }
    if (match) {
      setDialogKind(match.kind === "personal" ? "personal" : "org");
      setSelectedId(match.id);
      setDialogOpen(true);
      setDeepLinkHandled(true);
    } else if (!inlineQuery.isPending) {
      // Date not in first page — still open dialog so user can browse.
      setDialogOpen(true);
      setDeepLinkHandled(true);
    }
  }, [deepDate, deepPeriod, deepLinkHandled, inlineQuery.data, inlineQuery.isPending]);

  function openDialog() {
    setDialogKind("all");
    setSelectedId(items[0]?.id ?? null);
    setDialogOpen(true);
  }

  function openDialogFor(item: SentReportListItem) {
    setDialogKind(item.kind === "personal" ? "personal" : "org");
    setSelectedId(item.id);
    setDialogOpen(true);
  }

  return (
    <Panel as="section" className="mt-10" id="reports">
      <SignalsSectionHeader
        title="Reports."
        description={description}
        bordered={false}
        action={
          total > 0 ? (
            <Button type="button" variant="outline" size="sm" onClick={openDialog}>
              {total > 5 ? `View all (${total})` : "View all"}
            </Button>
          ) : null
        }
      />

      {inlineQuery.isPending ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">Loading sent reports…</p>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-sm text-muted-foreground">
          <Mail className="size-8 opacity-40" />
          <p>No reports sent yet. They appear here after the 19:00 local send.</p>
        </div>
      ) : (
        <div className="divide-y border-t border-border/70">
          {items.map((item) => (
            <ReportRow key={item.id} item={item} active={false} onSelect={() => openDialogFor(item)} />
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="flex min-h-[min(70vh,640px)] max-h-[min(90vh,900px)] w-[min(96vw,1100px)] max-w-[1100px] flex-col gap-0 overflow-hidden p-0 sm:max-w-[1100px]">
          <DialogHeader className="border-b px-5 py-4 pr-12">
            <DialogTitle>Sent reports</DialogTitle>
            <DialogDescription>{description} Select a row to preview the exact email.</DialogDescription>
            <div className="mt-3 flex flex-wrap gap-2">
              {filterKinds.map((kind) => (
                <Button
                  key={kind}
                  type="button"
                  size="sm"
                  variant={dialogKind === kind ? "default" : "outline"}
                  onClick={() => {
                    setDialogKind(kind);
                    setSelectedId(null);
                  }}
                >
                  {kind === "all" ? "All" : kind === "personal" ? "You" : "Team"}
                </Button>
              ))}
            </div>
          </DialogHeader>

          <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
            <div className="min-h-[min(55vh,520px)] max-h-[min(70vh,640px)] overflow-y-auto border-b lg:border-b-0 lg:border-r">
              {dialogQuery.isPending ? (
                <p className="px-4 py-6 text-sm text-muted-foreground">Loading…</p>
              ) : dialogItems.length === 0 ? (
                <p className="px-4 py-6 text-sm text-muted-foreground">No reports match this filter.</p>
              ) : (
                dialogItems.map((item) => (
                  <ReportRow
                    key={item.id}
                    item={item}
                    active={item.id === effectiveSelectedId}
                    onSelect={() => setSelectedId(item.id)}
                  />
                ))
              )}
            </div>

            <div className="flex min-h-[min(55vh,520px)] max-h-[min(70vh,640px)] flex-col overflow-y-auto p-4">
              {previewQuery.isPending ? (
                <p className="text-sm text-muted-foreground">Loading preview…</p>
              ) : selectedPreview ? (
                <>
                  <p className="mb-3 text-sm font-medium">{selectedPreview.subject}</p>
                  <p className="mb-4 text-xs text-muted-foreground">
                    To {selectedPreview.recipientName ?? selectedPreview.recipientEmail} ·{" "}
                    {formatSentAt(selectedPreview.sentAt)}
                  </p>
                  <ReportEmailFrame html={selectedPreview.html} title={selectedPreview.subject} />
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Select a report to preview the email.</p>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Panel>
  );
}
