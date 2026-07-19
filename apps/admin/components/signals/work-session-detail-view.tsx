import Link from "next/link";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { WorkCsvExportButton } from "@/components/signals/work-csv-export-button";
import { ToolLogoTile } from "@/components/tools/tool-brand-icon";
import { formatDateTime, formatShortDate } from "@/lib/format";
import type { WorkSessionDetail } from "@/lib/signals/queries/get-work-session-detail";
import { displayWorkTitle } from "@/lib/signals/work-display";
import { workSessionDetailToCsv } from "@/lib/signals/work-export";
import {
  changeNarrativeHeadline,
  formatFileChangeHint,
  formatHumanPhases,
  formatTraceDuration,
  formatTraceGitSummary,
  formatTraceLocation,
  formatTracePhases,
  formatTraceStats,
  humanizeAcceptanceStatus,
  humanizeEvidenceList,
  humanizeOutcomeStatus,
  looksLikeSystemInstruction,
  resolveChangeNarrative,
  type WorkTraceFileChange,
  type WorkTraceUserTurn,
} from "@/lib/signals/work-trace";

const FILE_CHANGE_PREVIEW = 40;

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function fileChangeKey(change: WorkTraceFileChange): string {
  return `${change.file}\0${change.op}`;
}

/** Session changelog first; otherwise union of per-turn files (deduped). */
function resolveSessionFiles(
  userTurns: WorkTraceUserTurn[],
  fileChangelog: WorkTraceFileChange[],
): WorkTraceFileChange[] {
  if (fileChangelog.length) return fileChangelog;
  const seen = new Set<string>();
  const out: WorkTraceFileChange[] = [];
  for (const turn of userTurns) {
    for (const change of turn.files ?? []) {
      const key = fileChangeKey(change);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(change);
    }
  }
  return out;
}

function partitionFileChanges(changes: WorkTraceFileChange[]): {
  primary: WorkTraceFileChange[];
  reads: WorkTraceFileChange[];
} {
  const writes = changes.filter((c) => c.op !== "read");
  const reads = changes.filter((c) => c.op === "read");
  if (!writes.length) return { primary: reads, reads: [] };
  return { primary: writes, reads };
}

/** Essays / research dumps are not changelogs — skip them and show files only. */
function looksLikeEssayNarrative(text: string, bullets?: string[]): boolean {
  const plain = text.replace(/\s+/g, " ").trim();
  if (plain.length > 280) return true;
  const list = bullets?.length
    ? bullets
    : text
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.startsWith("- ") || l.startsWith("* "))
        .map((l) => l.replace(/^[-*]\s+/, ""));
  if (list.length > 3) return true;
  if (list.some((b) => b.length > 140)) return true;
  const lower = plain.toLowerCase();
  const essayMarkers = [
    "we should",
    "would help",
    "gaps remain",
    "useful for coaching",
    "golden examples",
    "line-of-code",
  ];
  if (essayMarkers.some((m) => lower.includes(m))) return true;
  return false;
}

function Metric({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="flex h-full flex-col justify-start border-l-2 border-border-strong py-3 pl-4">
      <p className="text-xs font-medium leading-4 uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 flex min-h-10 items-end text-3xl font-semibold leading-none tracking-tight tabular-nums">
        {value}
      </p>
      {sub ? <p className="mt-2 text-xs leading-4 text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

function ChipList({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-wrap gap-2">
      {items.map((item) => (
        <li
          key={item}
          className="border border-border/70 bg-muted/40 px-2.5 py-1 text-xs font-medium"
        >
          {item}
        </li>
      ))}
    </ul>
  );
}

function FileChangeRows({ changes }: { changes: WorkTraceFileChange[] }) {
  const preview = changes.slice(0, FILE_CHANGE_PREVIEW);
  const extra = changes.length - preview.length;

  return (
    <div>
      <ul className="divide-y border-y border-border/60">
        {preview.map((change, index) => (
          <li
            key={`${change.file}-${change.op}-${change.source ?? "x"}-${index}`}
            className="flex items-baseline justify-between gap-3 py-2.5"
          >
            <span className="min-w-0 truncate font-mono text-[12px] leading-5 text-foreground">
              {change.file}
            </span>
            <span className="shrink-0 text-[11px] text-muted-foreground">
              {formatFileChangeHint(change)}
            </span>
          </li>
        ))}
      </ul>
      {extra > 0 ? (
        <details className="group/extra mt-2">
          <summary className="cursor-pointer list-none text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline [&::-webkit-details-marker]:hidden">
            <span className="group-open/extra:hidden">+{extra} more</span>
            <span className="hidden group-open/extra:inline">Show fewer</span>
          </summary>
          <ul className="mt-2 divide-y border-y border-border/60">
            {changes.slice(FILE_CHANGE_PREVIEW).map((change, index) => (
              <li
                key={`${change.file}-${change.op}-${change.source ?? "x"}-extra-${index}`}
                className="flex items-baseline justify-between gap-3 py-2.5"
              >
                <span className="min-w-0 truncate font-mono text-[12px] leading-5 text-foreground">
                  {change.file}
                </span>
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  {formatFileChangeHint(change)}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

function AskTimeline({ turns }: { turns: WorkTraceUserTurn[] }) {
  return (
    <ol className="mt-5">
      {turns.map((turn, index) => {
        const isLast = index === turns.length - 1;
        return (
          <li key={`${turn.at ?? "ask"}-${index}`} className="relative flex gap-4">
            <div className="flex w-3 shrink-0 flex-col items-center">
              <span
                className="mt-2 size-2.5 shrink-0 rounded-full bg-foreground/70"
                aria-hidden
              />
              {!isLast ? <span className="mt-1 w-px flex-1 bg-border" aria-hidden /> : null}
            </div>
            <div className={isLast ? "min-w-0 pb-0" : "min-w-0 pb-8"}>
              {turn.at ? (
                <p className="text-xs text-muted-foreground">{formatTime(turn.at)}</p>
              ) : null}
              <p className="mt-1 whitespace-pre-wrap text-[15px] leading-7 text-foreground">
                {turn.text}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function elapsedSub(
  startedAt: string | null | undefined,
  endedAt: string | null | undefined,
): string | undefined {
  if (startedAt && endedAt) {
    const startDay = new Date(startedAt).toDateString();
    const endDay = new Date(endedAt).toDateString();
    if (startDay !== endDay) {
      return `${formatShortDate(startedAt)} – ${formatShortDate(endedAt)}`;
    }
  }
  return undefined;
}

export function WorkSessionDetailView({
  session,
  backHref = "/signals/activity",
}: {
  session: WorkSessionDetail;
  backHref?: string;
  backLabel?: string;
}) {
  const title = displayWorkTitle(session.title, session.tldr);
  const fromTeam = backHref.startsWith("/team/");
  const location = formatTraceLocation(session.trace) ?? session.locationLabel;
  const stats = formatTraceStats(session.trace);
  const duration = formatTraceDuration(session.trace);
  const phasesRaw = formatTracePhases(session.trace);
  const phasesHuman = formatHumanPhases(session.trace);
  const gitSummary = formatTraceGitSummary(session.trace);
  const understanding = session.trace?.understanding;
  const tools = session.trace?.tools?.length
    ? session.trace.tools
    : session.toolCallCounts
      ? Object.entries(session.toolCallCounts)
          .sort((a, b) => b[1] - a[1])
          .map(([name]) => name)
      : [];
  const toolCounts = session.toolCallCounts ?? {};
  const skills = session.trace?.skills ?? [];
  const files = session.trace?.files ?? [];
  const steps = session.trace?.steps ?? [];
  const approach = session.trace?.approach?.trim() || null;
  const languages = session.trace?.languages ?? [];
  const churn = session.trace?.churn;
  const verify = session.trace?.verify;
  const git = session.trace?.git;
  const userTurns = session.trace?.userTurns ?? [];
  const fileChangelog = session.trace?.fileChangelog ?? [];

  const showIntent = Boolean(understanding?.intent && (understanding.confidence?.intent ?? 0) >= 0.5);
  const showAuthorship = Boolean(
    understanding?.authorship && (understanding.confidence?.authorship ?? 0) >= 0.5,
  );
  const showAcceptance = Boolean(
    understanding?.acceptance &&
      understanding.acceptance.status !== "unknown" &&
      (understanding.confidence?.acceptance ?? 0) >= 0.4,
  );
  const showOutcome = Boolean(
    understanding?.outcome &&
      understanding.outcome.status !== "unknown" &&
      (understanding.confidence?.outcome ?? 0) >= 0.4,
  );

  const outcomeValue = showOutcome
    ? humanizeOutcomeStatus(understanding!.outcome!.status)
    : showAcceptance
      ? humanizeAcceptanceStatus(understanding!.acceptance!.status)
      : null;

  const outcomeEvidence = showOutcome
    ? humanizeEvidenceList(understanding?.outcome?.evidence)
    : null;
  const acceptanceEvidence = showAcceptance
    ? humanizeEvidenceList(understanding?.acceptance?.signals)
    : null;

  const resolvedNarrative = resolveChangeNarrative({
    trace: session.trace,
    overview: session.overview,
    tldr: session.tldr,
    title: session.title,
  });

  const sessionFiles = resolveSessionFiles(userTurns, fileChangelog);
  const { primary: primaryFiles, reads: readFiles } = partitionFileChanges(sessionFiles);

  const scopeCount =
    primaryFiles.length ||
    sessionFiles.length ||
    files.length ||
    session.trace?.stats?.filesChanged ||
    0;
  const scopeValue =
    scopeCount > 0
      ? `${scopeCount} ${scopeCount === 1 ? "file" : "files"}`
      : stats ?? "—";
  const scopeSubParts = [
    languages.length ? languages.join(" · ") : null,
    session.trace?.testInvolved === true ? "tests involved" : null,
    stats && scopeCount > 0 && stats !== scopeValue ? stats : null,
  ].filter(Boolean);
  const scopeSub = scopeSubParts.length ? scopeSubParts.join(" · ") : undefined;

  const resultSub = [
    outcomeEvidence,
    showAcceptance && showOutcome
      ? humanizeAcceptanceStatus(understanding!.acceptance!.status)
      : acceptanceEvidence,
    gitSummary,
  ]
    .filter(Boolean)
    .join(" · ");

  const aiShareValue =
    showAuthorship && typeof understanding?.authorship?.aiShare === "number"
      ? `${Math.round(understanding.authorship.aiShare * 100)}%`
      : null;
  const aiShareSub = showAuthorship
    ? [
        understanding?.authorship?.aiEditEvents != null
          ? `AI ${understanding.authorship.aiEditEvents}`
          : null,
        understanding?.authorship?.humanEditEvents != null
          ? `human ${understanding.authorship.humanEditEvents}`
          : null,
        understanding?.authorship?.tabEditEvents != null
          ? `tab ${understanding.authorship.tabEditEvents}`
          : null,
      ]
        .filter(Boolean)
        .join(" · ") || undefined
    : undefined;

  const elapsedSubLine =
    phasesHuman ?? elapsedSub(session.startedAt, session.endedAt) ?? undefined;

  const primaryAsks: WorkTraceUserTurn[] = [];
  const setupMessages: WorkTraceUserTurn[] = [];
  for (const turn of userTurns) {
    if (looksLikeSystemInstruction(turn.text)) {
      setupMessages.push(turn);
    } else {
      primaryAsks.push(turn);
    }
  }

  const hasEvidenceUnderstanding =
    Boolean(understanding?.attempts?.signals?.length) ||
    Boolean(understanding?.context?.kinds?.length) ||
    Boolean(understanding?.sequence) ||
    showIntent ||
    showOutcome ||
    showAcceptance ||
    showAuthorship;
  const hasEvidenceSession = Boolean(approach || location || duration || phasesRaw || gitSummary);
  const hasEvidenceSignals = Boolean(
    churn || verify || languages.length || session.trace?.testInvolved != null,
  );
  const csv = workSessionDetailToCsv(session);
  const filename = `work-session-${session.id.slice(0, 10)}.csv`;

  const kpiSlots: Array<{ label: string; value: string; sub?: string }> = [
    { label: "Time", value: duration ?? "—", sub: elapsedSubLine },
    { label: "Files", value: scopeValue, sub: scopeSub },
    { label: "Outcome", value: outcomeValue ?? "—", sub: resultSub || undefined },
  ];
  if (aiShareValue) {
    kpiSlots.push({ label: "AI share", value: aiShareValue, sub: aiShareSub });
  }

  const changeLine =
    resolvedNarrative &&
    !looksLikeEssayNarrative(resolvedNarrative.text, resolvedNarrative.bullets)
      ? changeNarrativeHeadline(resolvedNarrative.text)
      : null;

  const hasChanges = Boolean(changeLine || primaryFiles.length || readFiles.length);
  const hasAsk = primaryAsks.length > 0 || setupMessages.length > 0;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        {fromTeam ? (
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link href="/team">Team</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link href={`/team/${session.developer.id}`}>{session.developer.name}</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link href={backHref}>Work</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{title}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        ) : (
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link href="/signals">Signals</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link href="/signals/activity">Activity</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{title}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        )}
        <WorkCsvExportButton filename={filename} csv={csv} label="Export CSV" />
      </div>

      <div className="mt-6 flex items-start gap-3">
        <ToolLogoTile tool={session.toolName} size="md" light className="mt-1 shrink-0" />
        <div className="min-w-0">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-[2.15rem]">{title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {[session.toolName, session.model, session.mode, formatDateTime(session.observedAt)]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            <Link
              href={`/team/${session.developer.id}/work`}
              className="underline-offset-4 hover:text-foreground hover:underline"
            >
              {session.developer.name}
            </Link>
            {location ? ` · ${location}` : ""}
          </p>
        </div>
      </div>

      <div
        className={`mt-10 grid items-start gap-8 sm:grid-cols-2 ${
          kpiSlots.length >= 4 ? "xl:grid-cols-4" : "xl:grid-cols-3"
        }`}
      >
        {kpiSlots.map((kpi) => (
          <Metric key={kpi.label} label={kpi.label} value={kpi.value} sub={kpi.sub} />
        ))}
      </div>

      {(hasAsk || hasChanges) ? (
        <div className="mt-10 grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(220px,300px)]">
          <section className="min-w-0">
            <h2 className="text-lg font-semibold tracking-tight">Asked.</h2>
            {primaryAsks.length ? (
              <AskTimeline turns={primaryAsks} />
            ) : hasAsk ? (
              <p className="mt-4 text-sm text-muted-foreground">
                No clear ask captured — only setup messages from the tool.
              </p>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">No ask captured for this session.</p>
            )}

            {setupMessages.length ? (
              <details className="group mt-4">
                <summary className="cursor-pointer list-none text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline [&::-webkit-details-marker]:hidden">
                  <span className="group-open:hidden">
                    {setupMessages.length} setup message
                    {setupMessages.length === 1 ? "" : "s"}
                  </span>
                  <span className="hidden group-open:inline">Hide setup messages</span>
                </summary>
                <div className="mt-4 opacity-70">
                  <AskTimeline turns={setupMessages} />
                </div>
              </details>
            ) : null}
          </section>

          {hasChanges ? (
            <aside className="min-w-0 border border-border/60 bg-muted/20 p-4 lg:sticky lg:top-6 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-sm font-semibold tracking-tight">Changed</h2>
                {primaryFiles.length ? (
                  <p className="text-xs tabular-nums text-muted-foreground">
                    {primaryFiles.length}
                  </p>
                ) : null}
              </div>
              {changeLine ? (
                <p className="mt-3 text-xs leading-5 text-muted-foreground">{changeLine}</p>
              ) : null}
              {primaryFiles.length ? (
                <div className="mt-3">
                  <FileChangeRows changes={primaryFiles} />
                </div>
              ) : null}
              {readFiles.length ? (
                <details className="group/reads mt-3">
                  <summary className="cursor-pointer list-none text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline [&::-webkit-details-marker]:hidden">
                    Also read {readFiles.length}
                  </summary>
                  <div className="mt-2">
                    <FileChangeRows changes={readFiles} />
                  </div>
                </details>
              ) : null}
            </aside>
          ) : null}
        </div>
      ) : null}

      <details className="group mt-12 border-t border-border/60 pt-6">
        <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
          <h2 className="text-lg font-semibold tracking-tight underline-offset-2 group-open:no-underline hover:underline group-open:hover:no-underline">
            Session details.
          </h2>
          <p className="mt-1.5 text-xs text-muted-foreground group-open:hidden">
            Tools, signals, steps, and source
          </p>
        </summary>

        <div className="mt-6 space-y-8">
          {hasEvidenceUnderstanding && understanding ? (
            <section>
              <h3 className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
                Signals we inferred
              </h3>
              <dl className="mt-3 grid gap-4 text-sm sm:grid-cols-2">
                {understanding.intent ? (
                  <div className="sm:col-span-2">
                    <dt className="text-xs text-muted-foreground">Intent</dt>
                    <dd className="mt-1 font-medium">{understanding.intent}</dd>
                    {understanding.intentSource ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        via {understanding.intentSource.replaceAll("_", " ")}
                        {(understanding.confidence?.intent ?? 0) < 0.5
                          ? " · low confidence"
                          : ""}
                      </p>
                    ) : null}
                  </div>
                ) : null}
                {understanding.outcome && understanding.outcome.status !== "unknown" ? (
                  <div>
                    <dt className="text-xs text-muted-foreground">Outcome</dt>
                    <dd className="mt-1 font-medium">
                      {humanizeOutcomeStatus(understanding.outcome.status)}
                    </dd>
                    {understanding.outcome.evidence?.length ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {understanding.outcome.evidence.join(" · ")}
                      </p>
                    ) : null}
                  </div>
                ) : null}
                {understanding.acceptance && understanding.acceptance.status !== "unknown" ? (
                  <div>
                    <dt className="text-xs text-muted-foreground">Acceptance</dt>
                    <dd className="mt-1 font-medium">
                      {humanizeAcceptanceStatus(understanding.acceptance.status)}
                    </dd>
                    {understanding.acceptance.signals?.length ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {understanding.acceptance.signals.join(" · ")}
                      </p>
                    ) : null}
                  </div>
                ) : null}
                {understanding.authorship ? (
                  <div>
                    <dt className="text-xs text-muted-foreground">Authorship</dt>
                    <dd className="mt-1 font-medium">
                      {typeof understanding.authorship.aiShare === "number"
                        ? `${Math.round(understanding.authorship.aiShare * 100)}% AI edits`
                        : "tracked"}
                    </dd>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {[
                        understanding.authorship.aiEditEvents != null
                          ? `AI ${understanding.authorship.aiEditEvents}`
                          : null,
                        understanding.authorship.humanEditEvents != null
                          ? `human ${understanding.authorship.humanEditEvents}`
                          : null,
                        understanding.authorship.tabEditEvents != null
                          ? `tab ${understanding.authorship.tabEditEvents}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                ) : null}
                {understanding.attempts?.signals?.length ? (
                  <div>
                    <dt className="text-xs text-muted-foreground">Attempts</dt>
                    <dd className="mt-1 font-medium">score {understanding.attempts.score}</dd>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {understanding.attempts.signals.join(" · ")}
                    </p>
                  </div>
                ) : null}
                {understanding.context?.kinds?.length ? (
                  <div>
                    <dt className="text-xs text-muted-foreground">Context</dt>
                    <dd className="mt-1 font-medium">
                      {understanding.context.kinds.join(" · ")}
                    </dd>
                    {understanding.context.primaryFiles?.length ? (
                      <p className="mt-1 font-mono text-xs text-muted-foreground">
                        {understanding.context.primaryFiles.join(", ")}
                      </p>
                    ) : null}
                  </div>
                ) : null}
                {understanding.sequence &&
                (understanding.sequence.userTurns ||
                  understanding.sequence.assistantTurns ||
                  understanding.sequence.toolCalls) ? (
                  <div>
                    <dt className="text-xs text-muted-foreground">Sequence</dt>
                    <dd className="mt-1 font-medium">
                      {[
                        understanding.sequence.userTurns
                          ? `${understanding.sequence.userTurns} user`
                          : null,
                        understanding.sequence.assistantTurns
                          ? `${understanding.sequence.assistantTurns} assistant`
                          : null,
                        understanding.sequence.toolCalls
                          ? `${understanding.sequence.toolCalls} tools`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </dd>
                  </div>
                ) : null}
              </dl>
            </section>
          ) : null}

          {hasEvidenceSession ? (
            <section>
              <h3 className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
                Session
              </h3>
              <dl className="mt-3 grid gap-4 text-sm sm:grid-cols-2">
                {approach ? (
                  <div className="sm:col-span-2">
                    <dt className="text-xs text-muted-foreground">Approach</dt>
                    <dd className="mt-1 font-medium">{approach}</dd>
                  </div>
                ) : null}
                {location ? (
                  <div>
                    <dt className="text-xs text-muted-foreground">Where</dt>
                    <dd className="mt-1 font-medium">{location}</dd>
                    {session.trace?.location?.kind ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {session.trace.location.kind}
                      </p>
                    ) : null}
                  </div>
                ) : null}
                {duration ? (
                  <div>
                    <dt className="text-xs text-muted-foreground">Time</dt>
                    <dd className="mt-1 font-medium">{duration}</dd>
                  </div>
                ) : null}
                {phasesRaw ? (
                  <div>
                    <dt className="text-xs text-muted-foreground">Phases</dt>
                    <dd className="mt-1 font-medium">{phasesHuman ?? phasesRaw}</dd>
                    {phasesHuman && phasesRaw !== phasesHuman.replaceAll(" → ", ">") ? (
                      <p className="mt-1 font-mono text-xs text-muted-foreground">{phasesRaw}</p>
                    ) : null}
                  </div>
                ) : null}
                {gitSummary ? (
                  <div className="sm:col-span-2">
                    <dt className="text-xs text-muted-foreground">Git</dt>
                    <dd className="mt-1 font-medium">{gitSummary}</dd>
                  </div>
                ) : null}
                {session.device?.hostname ? (
                  <div>
                    <dt className="text-xs text-muted-foreground">Device</dt>
                    <dd className="mt-1 font-medium">{session.device.hostname}</dd>
                  </div>
                ) : null}
              </dl>
            </section>
          ) : null}

          {hasEvidenceSignals ? (
            <section>
              <h3 className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
                Signals
              </h3>
              <dl className="mt-3 grid gap-4 text-sm sm:grid-cols-2">
                {churn ? (
                  <div>
                    <dt className="text-xs text-muted-foreground">Edit churn</dt>
                    <dd className="mt-1 font-medium">
                      {churn.filesRewritten ?? 0} files rewritten
                      {churn.rewriteEvents ? ` · ${churn.rewriteEvents} rewrites` : ""}
                    </dd>
                  </div>
                ) : null}
                {verify ? (
                  <div>
                    <dt className="text-xs text-muted-foreground">Verify</dt>
                    <dd className="mt-1 font-medium">
                      {verify.afterEdit ? "after edit" : "present"}
                      {verify.kinds?.length ? ` · ${verify.kinds.join(", ")}` : ""}
                    </dd>
                  </div>
                ) : null}
                {languages.length ? (
                  <div>
                    <dt className="text-xs text-muted-foreground">Languages</dt>
                    <dd className="mt-1 font-medium">{languages.join(" · ")}</dd>
                  </div>
                ) : null}
                {session.trace?.testInvolved != null ? (
                  <div>
                    <dt className="text-xs text-muted-foreground">Tests</dt>
                    <dd className="mt-1 font-medium">
                      {session.trace.testInvolved ? "involved" : "not involved"}
                    </dd>
                  </div>
                ) : null}
              </dl>
            </section>
          ) : null}

          {(skills.length > 0 || tools.length > 0) && (
            <div className="grid gap-8 sm:grid-cols-2">
              {skills.length ? (
                <div>
                  <h3 className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
                    Skills
                  </h3>
                  <div className="mt-3">
                    <ChipList
                      items={skills.map((skill) =>
                        session.trace?.skillCounts?.[skill]
                          ? `${skill} ×${session.trace.skillCounts[skill]}`
                          : skill,
                      )}
                    />
                  </div>
                </div>
              ) : null}
              {tools.length ? (
                <div>
                  <h3 className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
                    Tools
                  </h3>
                  <ul className="mt-3 space-y-2">
                    {tools.map((tool) => (
                      <li
                        key={tool}
                        className="flex items-baseline justify-between gap-4 text-sm"
                      >
                        <span className="font-medium">{tool}</span>
                        {toolCounts[tool] ? (
                          <span className="tabular-nums text-muted-foreground">
                            ×{toolCounts[tool]}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          )}

          {files.length && !sessionFiles.length ? (
            <section>
              <h3 className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
                Files
              </h3>
              <ul className="mt-3 columns-1 gap-x-8 sm:columns-2">
                {files.map((file) => (
                  <li
                    key={file}
                    className="mb-2 break-inside-avoid font-mono text-[13px] leading-5"
                  >
                    {file}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {steps.length ? (
            <section>
              <h3 className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
                Steps
              </h3>
              <ol className="mt-3 space-y-2">
                {steps.map((step, index) => (
                  <li
                    key={`${step.kind}-${step.name ?? index}`}
                    className="flex gap-3 text-sm"
                  >
                    <span className="w-5 tabular-nums text-muted-foreground">{index + 1}</span>
                    <span>
                      {step.name ?? step.kind}
                      {step.name && step.kind !== "tool" ? (
                        <span className="text-muted-foreground"> · {step.kind}</span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}

          {stats ? (
            <section>
              <h3 className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
                Diff
              </h3>
              <p className="mt-3 text-sm font-medium tabular-nums">{stats}</p>
            </section>
          ) : null}

          {git?.commits?.length ? (
            <section>
              <h3 className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
                Commits
              </h3>
              <ul className="mt-3 space-y-3">
                {git.commits.map((commit) => (
                  <li key={commit.sha} className="text-sm">
                    <p className="font-medium">{commit.subject}</p>
                    <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                      {commit.sha}
                      {commit.filesChanged ? ` · ${commit.filesChanged} files` : ""}
                      {commit.linesAdded || commit.linesRemoved
                        ? ` · +${commit.linesAdded ?? 0}/-${commit.linesRemoved ?? 0}`
                        : ""}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section>
            <h3 className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
              Source
            </h3>
            <dl className="mt-3 grid gap-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted-foreground">Extractor</dt>
                <dd className="mt-1 font-medium">{session.source}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Local id</dt>
                <dd className="mt-1 break-all font-mono text-[13px]">{session.localId}</dd>
              </div>
              {session.startedAt ? (
                <div>
                  <dt className="text-xs text-muted-foreground">Started</dt>
                  <dd className="mt-1">{formatDateTime(session.startedAt)}</dd>
                </div>
              ) : null}
              {session.endedAt ? (
                <div>
                  <dt className="text-xs text-muted-foreground">Ended</dt>
                  <dd className="mt-1">{formatDateTime(session.endedAt)}</dd>
                </div>
              ) : null}
            </dl>
          </section>
        </div>
      </details>
    </div>
  );
}
