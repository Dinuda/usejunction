export type WorkTraceLocation = {
  kind?: string;
  project?: string;
  repository?: { host?: string | null; owner?: string | null; name?: string | null } | null;
};

export type WorkTraceStep = {
  kind: string;
  name?: string;
};

export type WorkTraceStats = {
  linesAdded?: number;
  linesRemoved?: number;
  filesChanged?: number;
};

export type WorkTraceChurn = {
  filesRewritten?: number;
  rewriteEvents?: number;
};

export type WorkTraceVerify = {
  afterEdit?: boolean;
  kinds?: string[];
};

export type WorkTraceGitCommit = {
  sha: string;
  subject: string;
  filesChanged?: number;
  linesAdded?: number;
  linesRemoved?: number;
};

export type WorkTraceGit = {
  branch?: string;
  committed?: boolean;
  prNumber?: number;
  commits?: WorkTraceGitCommit[];
};

export type WorkTraceUnderstanding = {
  version: 1;
  intent?: string;
  intentSource?: "summary" | "title" | "plan" | "user_turn_derived";
  context?: {
    kinds?: string[];
    primaryFiles?: string[];
    skills?: string[];
  };
  actors?: { tool: string; model?: string; mode?: string };
  sequence?: {
    fingerprint?: string;
    userTurns?: number;
    assistantTurns?: number;
    toolCalls?: number;
  };
  attempts?: { score: number; signals?: string[] };
  authorship?: {
    aiEditEvents?: number;
    humanEditEvents?: number;
    tabEditEvents?: number;
    aiShare?: number;
    requestCount?: number;
  };
  acceptance?: {
    status: "unknown" | "likely_kept" | "mixed" | "abandoned";
    signals?: string[];
  };
  outcome?: {
    status: "unknown" | "in_progress" | "verified" | "committed" | "abandoned";
    evidence?: string[];
  };
  confidence?: {
    intent?: number;
    authorship?: number;
    acceptance?: number;
    outcome?: number;
  };
};

export type WorkTraceFileChange = {
  file: string;
  op: "read" | "write" | "create" | "delete" | "edit" | "unknown";
  source?: "composer" | "human" | "tab" | "tool" | "unknown";
  events?: number;
};

/** Structured activity — user turn text under `text`; changeNarrative.text allowlisted; no full chat or file contents. */
export type WorkTraceUserTurn = {
  at?: string;
  text: string;
  files?: WorkTraceFileChange[];
};

export type WorkTraceChangeNarrative = {
  text: string;
  at?: string;
  source: "assistant_final" | "conversation_summary" | "composer_subtitle";
  bullets?: string[];
};

export type WorkTrace = {
  approach?: string;
  location?: WorkTraceLocation;
  skills?: string[];
  tools?: string[];
  files?: string[];
  steps?: WorkTraceStep[];
  stats?: WorkTraceStats;
  durationSeconds?: number;
  phases?: string[];
  phaseFingerprint?: string;
  churn?: WorkTraceChurn;
  verify?: WorkTraceVerify;
  languages?: string[];
  testInvolved?: boolean;
  skillCounts?: Record<string, number>;
  git?: WorkTraceGit;
  understanding?: WorkTraceUnderstanding;
  userTurns?: WorkTraceUserTurn[];
  fileChangelog?: WorkTraceFileChange[];
  changeNarrative?: WorkTraceChangeNarrative;
};

function asNonNegInt(value: unknown, max: number): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return undefined;
  return Math.min(Math.floor(value), max);
}

export function parseWorkTrace(value: unknown): WorkTrace | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const out: WorkTrace = {};

  if (typeof raw.approach === "string" && raw.approach.trim()) {
    out.approach = raw.approach.trim();
  }
  if (raw.location && typeof raw.location === "object" && !Array.isArray(raw.location)) {
    const loc = raw.location as Record<string, unknown>;
    const location: WorkTraceLocation = {};
    if (typeof loc.kind === "string" && loc.kind.trim()) location.kind = loc.kind.trim();
    if (typeof loc.project === "string" && loc.project.trim()) location.project = loc.project.trim();
    if (loc.repository && typeof loc.repository === "object" && !Array.isArray(loc.repository)) {
      const repo = loc.repository as Record<string, unknown>;
      location.repository = {
        host: typeof repo.host === "string" ? repo.host : null,
        owner: typeof repo.owner === "string" ? repo.owner : null,
        name: typeof repo.name === "string" ? repo.name : null,
      };
    }
    if (location.kind || location.project || location.repository) out.location = location;
  }
  if (Array.isArray(raw.skills)) {
    out.skills = raw.skills.filter((s): s is string => typeof s === "string" && Boolean(s.trim())).slice(0, 40);
  }
  if (Array.isArray(raw.tools)) {
    out.tools = raw.tools.filter((s): s is string => typeof s === "string" && Boolean(s.trim())).slice(0, 80);
  }
  if (Array.isArray(raw.files)) {
    out.files = raw.files.filter((s): s is string => typeof s === "string" && Boolean(s.trim())).slice(0, 40);
  }
  if (Array.isArray(raw.steps)) {
    out.steps = raw.steps
      .map((step) => {
        if (!step || typeof step !== "object" || Array.isArray(step)) return null;
        const row = step as Record<string, unknown>;
        if (typeof row.kind !== "string" || !row.kind.trim()) return null;
        return {
          kind: row.kind.trim(),
          ...(typeof row.name === "string" && row.name.trim() ? { name: row.name.trim() } : {}),
        };
      })
      .filter((step): step is WorkTraceStep => Boolean(step))
      .slice(0, 40);
  }
  if (raw.stats && typeof raw.stats === "object" && !Array.isArray(raw.stats)) {
    const statsRaw = raw.stats as Record<string, unknown>;
    const stats: WorkTraceStats = {};
    const linesAdded = asNonNegInt(statsRaw.linesAdded, 10_000_000);
    const linesRemoved = asNonNegInt(statsRaw.linesRemoved, 10_000_000);
    const filesChanged = asNonNegInt(statsRaw.filesChanged, 1_000_000);
    if (linesAdded !== undefined) stats.linesAdded = linesAdded;
    if (linesRemoved !== undefined) stats.linesRemoved = linesRemoved;
    if (filesChanged !== undefined) stats.filesChanged = filesChanged;
    if (Object.keys(stats).length) out.stats = stats;
  }

  const durationSeconds = asNonNegInt(raw.durationSeconds, 7 * 24 * 60 * 60);
  if (durationSeconds !== undefined) out.durationSeconds = durationSeconds;

  if (Array.isArray(raw.phases)) {
    out.phases = raw.phases
      .filter((s): s is string => typeof s === "string" && Boolean(s.trim()))
      .map((s) => s.trim().slice(0, 32))
      .slice(0, 8);
  }
  if (typeof raw.phaseFingerprint === "string" && raw.phaseFingerprint.trim()) {
    out.phaseFingerprint = raw.phaseFingerprint.trim().slice(0, 120);
  }

  if (raw.churn && typeof raw.churn === "object" && !Array.isArray(raw.churn)) {
    const churnRaw = raw.churn as Record<string, unknown>;
    const churn: WorkTraceChurn = {};
    const filesRewritten = asNonNegInt(churnRaw.filesRewritten, 1_000_000);
    const rewriteEvents = asNonNegInt(churnRaw.rewriteEvents, 10_000_000);
    if (filesRewritten !== undefined) churn.filesRewritten = filesRewritten;
    if (rewriteEvents !== undefined) churn.rewriteEvents = rewriteEvents;
    if (Object.keys(churn).length) out.churn = churn;
  }

  if (raw.verify && typeof raw.verify === "object" && !Array.isArray(raw.verify)) {
    const verifyRaw = raw.verify as Record<string, unknown>;
    const verify: WorkTraceVerify = {};
    if (typeof verifyRaw.afterEdit === "boolean") verify.afterEdit = verifyRaw.afterEdit;
    if (Array.isArray(verifyRaw.kinds)) {
      verify.kinds = verifyRaw.kinds
        .filter((s): s is string => typeof s === "string" && Boolean(s.trim()))
        .map((s) => s.trim().slice(0, 32))
        .slice(0, 12);
    }
    if (verify.afterEdit !== undefined || (verify.kinds && verify.kinds.length)) out.verify = verify;
  }

  if (Array.isArray(raw.languages)) {
    out.languages = raw.languages
      .filter((s): s is string => typeof s === "string" && Boolean(s.trim()))
      .map((s) => s.trim().slice(0, 32))
      .slice(0, 12);
  }
  if (typeof raw.testInvolved === "boolean") out.testInvolved = raw.testInvolved;

  if (raw.skillCounts && typeof raw.skillCounts === "object" && !Array.isArray(raw.skillCounts)) {
    const counts: Record<string, number> = {};
    for (const [key, count] of Object.entries(raw.skillCounts as Record<string, unknown>)) {
      const n = asNonNegInt(count, 1_000_000);
      const name = key.trim().slice(0, 128);
      if (!name || n === undefined || n <= 0) continue;
      counts[name] = n;
      if (Object.keys(counts).length >= 40) break;
    }
    if (Object.keys(counts).length) out.skillCounts = counts;
  }

  if (raw.git && typeof raw.git === "object" && !Array.isArray(raw.git)) {
    const gitRaw = raw.git as Record<string, unknown>;
    const git: WorkTraceGit = {};
    if (typeof gitRaw.branch === "string" && gitRaw.branch.trim()) {
      git.branch = gitRaw.branch.trim().slice(0, 200);
    }
    if (typeof gitRaw.committed === "boolean") git.committed = gitRaw.committed;
    const prNumber = asNonNegInt(gitRaw.prNumber, 10_000_000);
    if (prNumber !== undefined && prNumber >= 1) git.prNumber = prNumber;
    if (Array.isArray(gitRaw.commits)) {
      git.commits = gitRaw.commits
        .map((row) => {
          if (!row || typeof row !== "object" || Array.isArray(row)) return null;
          const c = row as Record<string, unknown>;
          const sha = typeof c.sha === "string" ? c.sha.trim().slice(0, 12) : "";
          const subject = typeof c.subject === "string" ? c.subject.trim().slice(0, 120) : "";
          if (sha.length < 7 || !subject) return null;
          const commit: WorkTraceGitCommit = { sha, subject };
          const filesChanged = asNonNegInt(c.filesChanged, 1_000_000);
          const linesAdded = asNonNegInt(c.linesAdded, 10_000_000);
          const linesRemoved = asNonNegInt(c.linesRemoved, 10_000_000);
          if (filesChanged !== undefined) commit.filesChanged = filesChanged;
          if (linesAdded !== undefined) commit.linesAdded = linesAdded;
          if (linesRemoved !== undefined) commit.linesRemoved = linesRemoved;
          return commit;
        })
        .filter((c): c is WorkTraceGitCommit => Boolean(c))
        .slice(0, 20);
    }
    if (git.branch || git.committed !== undefined || git.prNumber || git.commits?.length) {
      out.git = git;
    }
  }

  if (raw.understanding && typeof raw.understanding === "object" && !Array.isArray(raw.understanding)) {
    const uRaw = raw.understanding as Record<string, unknown>;
    const understanding: WorkTraceUnderstanding = { version: 1 };
    if (typeof uRaw.intent === "string" && uRaw.intent.trim()) {
      understanding.intent = uRaw.intent.trim().slice(0, 160);
    }
    if (
      uRaw.intentSource === "summary" ||
      uRaw.intentSource === "title" ||
      uRaw.intentSource === "plan" ||
      uRaw.intentSource === "user_turn_derived"
    ) {
      understanding.intentSource = uRaw.intentSource;
    }
    if (uRaw.context && typeof uRaw.context === "object" && !Array.isArray(uRaw.context)) {
      const c = uRaw.context as Record<string, unknown>;
      const context: NonNullable<WorkTraceUnderstanding["context"]> = {};
      if (Array.isArray(c.kinds)) {
        context.kinds = c.kinds
          .filter((s): s is string => typeof s === "string" && Boolean(s.trim()))
          .map((s) => s.trim().slice(0, 32))
          .slice(0, 8);
      }
      if (Array.isArray(c.primaryFiles)) {
        context.primaryFiles = c.primaryFiles
          .filter((s): s is string => typeof s === "string" && Boolean(s.trim()))
          .map((s) => s.trim().slice(0, 180))
          .slice(0, 8);
      }
      if (Array.isArray(c.skills)) {
        context.skills = c.skills
          .filter((s): s is string => typeof s === "string" && Boolean(s.trim()))
          .map((s) => s.trim().slice(0, 128))
          .slice(0, 8);
      }
      if (context.kinds?.length || context.primaryFiles?.length || context.skills?.length) {
        understanding.context = context;
      }
    }
    if (uRaw.actors && typeof uRaw.actors === "object" && !Array.isArray(uRaw.actors)) {
      const a = uRaw.actors as Record<string, unknown>;
      if (typeof a.tool === "string" && a.tool.trim()) {
        understanding.actors = {
          tool: a.tool.trim().slice(0, 64),
          ...(typeof a.model === "string" && a.model.trim() ? { model: a.model.trim().slice(0, 128) } : {}),
          ...(typeof a.mode === "string" && a.mode.trim() ? { mode: a.mode.trim().slice(0, 64) } : {}),
        };
      }
    }
    if (uRaw.sequence && typeof uRaw.sequence === "object" && !Array.isArray(uRaw.sequence)) {
      const s = uRaw.sequence as Record<string, unknown>;
      const sequence: NonNullable<WorkTraceUnderstanding["sequence"]> = {};
      if (typeof s.fingerprint === "string" && s.fingerprint.trim()) {
        sequence.fingerprint = s.fingerprint.trim().slice(0, 120);
      }
      const userTurns = asNonNegInt(s.userTurns, 100_000);
      const assistantTurns = asNonNegInt(s.assistantTurns, 100_000);
      const toolCalls = asNonNegInt(s.toolCalls, 1_000_000);
      if (userTurns !== undefined) sequence.userTurns = userTurns;
      if (assistantTurns !== undefined) sequence.assistantTurns = assistantTurns;
      if (toolCalls !== undefined) sequence.toolCalls = toolCalls;
      if (Object.keys(sequence).length) understanding.sequence = sequence;
    }
    if (uRaw.attempts && typeof uRaw.attempts === "object" && !Array.isArray(uRaw.attempts)) {
      const a = uRaw.attempts as Record<string, unknown>;
      const score = asNonNegInt(a.score, 1000);
      if (score !== undefined && score >= 1) {
        understanding.attempts = {
          score,
          ...(Array.isArray(a.signals)
            ? {
                signals: a.signals
                  .filter((s): s is string => typeof s === "string" && Boolean(s.trim()))
                  .map((s) => s.trim().slice(0, 64))
                  .slice(0, 8),
              }
            : {}),
        };
      }
    }
    if (uRaw.authorship && typeof uRaw.authorship === "object" && !Array.isArray(uRaw.authorship)) {
      const a = uRaw.authorship as Record<string, unknown>;
      const authorship: NonNullable<WorkTraceUnderstanding["authorship"]> = {};
      const ai = asNonNegInt(a.aiEditEvents, 10_000_000);
      const human = asNonNegInt(a.humanEditEvents, 10_000_000);
      const tab = asNonNegInt(a.tabEditEvents, 10_000_000);
      const req = asNonNegInt(a.requestCount, 1_000_000);
      if (ai !== undefined) authorship.aiEditEvents = ai;
      if (human !== undefined) authorship.humanEditEvents = human;
      if (tab !== undefined) authorship.tabEditEvents = tab;
      if (req !== undefined) authorship.requestCount = req;
      if (typeof a.aiShare === "number" && Number.isFinite(a.aiShare)) {
        authorship.aiShare = Math.min(1, Math.max(0, a.aiShare));
      }
      if (Object.keys(authorship).length) understanding.authorship = authorship;
    }
    if (uRaw.acceptance && typeof uRaw.acceptance === "object" && !Array.isArray(uRaw.acceptance)) {
      const a = uRaw.acceptance as Record<string, unknown>;
      if (a.status === "unknown" || a.status === "likely_kept" || a.status === "mixed" || a.status === "abandoned") {
        understanding.acceptance = {
          status: a.status,
          ...(Array.isArray(a.signals)
            ? {
                signals: a.signals
                  .filter((s): s is string => typeof s === "string" && Boolean(s.trim()))
                  .map((s) => s.trim().slice(0, 64))
                  .slice(0, 8),
              }
            : {}),
        };
      }
    }
    if (uRaw.outcome && typeof uRaw.outcome === "object" && !Array.isArray(uRaw.outcome)) {
      const o = uRaw.outcome as Record<string, unknown>;
      if (
        o.status === "unknown" ||
        o.status === "in_progress" ||
        o.status === "verified" ||
        o.status === "committed" ||
        o.status === "abandoned"
      ) {
        understanding.outcome = {
          status: o.status,
          ...(Array.isArray(o.evidence)
            ? {
                evidence: o.evidence
                  .filter((s): s is string => typeof s === "string" && Boolean(s.trim()))
                  .map((s) => s.trim().slice(0, 64))
                  .slice(0, 8),
              }
            : {}),
        };
      }
    }
    if (uRaw.confidence && typeof uRaw.confidence === "object" && !Array.isArray(uRaw.confidence)) {
      const c = uRaw.confidence as Record<string, unknown>;
      const confidence: NonNullable<WorkTraceUnderstanding["confidence"]> = {};
      for (const key of ["intent", "authorship", "acceptance", "outcome"] as const) {
        if (typeof c[key] === "number" && Number.isFinite(c[key])) {
          confidence[key] = Math.min(1, Math.max(0, c[key] as number));
        }
      }
      if (Object.keys(confidence).length) understanding.confidence = confidence;
    }
    if (
      understanding.intent ||
      understanding.context ||
      understanding.actors ||
      understanding.sequence ||
      understanding.attempts ||
      understanding.authorship ||
      understanding.acceptance ||
      understanding.outcome
    ) {
      out.understanding = understanding;
    }
  }

  if (Array.isArray(raw.userTurns)) {
    out.userTurns = raw.userTurns
      .map((row) => {
        if (!row || typeof row !== "object" || Array.isArray(row)) return null;
        const t = row as Record<string, unknown>;
        if (typeof t.text !== "string" || !t.text.trim()) return null;
        const turn: WorkTraceUserTurn = { text: t.text.trim().slice(0, 2000) };
        if (typeof t.at === "string" && t.at.trim()) {
          const d = new Date(t.at);
          if (!Number.isNaN(d.getTime())) turn.at = d.toISOString();
        }
        if (Array.isArray(t.files)) {
          const files = t.files
            .map((f) => parseFileChangeRow(f))
            .filter((c): c is WorkTraceFileChange => Boolean(c))
            .slice(0, 20);
          if (files.length) turn.files = files;
        }
        return turn;
      })
      .filter((t): t is WorkTraceUserTurn => Boolean(t))
      .slice(0, 40);
    if (!out.userTurns.length) delete out.userTurns;
  }

  if (Array.isArray(raw.fileChangelog)) {
    out.fileChangelog = raw.fileChangelog
      .map((row) => parseFileChangeRow(row))
      .filter((c): c is WorkTraceFileChange => Boolean(c))
      .slice(0, 80);
    if (!out.fileChangelog.length) delete out.fileChangelog;
  }

  if (raw.changeNarrative && typeof raw.changeNarrative === "object" && !Array.isArray(raw.changeNarrative)) {
    const n = parseChangeNarrativeRow(raw.changeNarrative);
    if (n) out.changeNarrative = n;
  }

  return Object.keys(out).length ? out : null;
}

function parseChangeNarrativeRow(row: unknown): WorkTraceChangeNarrative | null {
  if (!row || typeof row !== "object" || Array.isArray(row)) return null;
  const n = row as Record<string, unknown>;
  if (typeof n.text !== "string" || !n.text.trim()) return null;
  const allowedSources = new Set(["assistant_final", "conversation_summary", "composer_subtitle"]);
  if (typeof n.source !== "string" || !allowedSources.has(n.source)) return null;
  const out: WorkTraceChangeNarrative = {
    text: n.text.trim().slice(0, 2000),
    source: n.source as WorkTraceChangeNarrative["source"],
  };
  if (typeof n.at === "string" && n.at.trim()) {
    const d = new Date(n.at);
    if (!Number.isNaN(d.getTime())) out.at = d.toISOString();
  }
  if (Array.isArray(n.bullets)) {
    const bullets = n.bullets
      .filter((b): b is string => typeof b === "string" && Boolean(b.trim()))
      .map((b) => b.trim().slice(0, 400))
      .slice(0, 12);
    if (bullets.length) out.bullets = bullets;
  }
  return out;
}

function parseFileChangeRow(row: unknown): WorkTraceFileChange | null {
  if (!row || typeof row !== "object" || Array.isArray(row)) return null;
  const c = row as Record<string, unknown>;
  if (typeof c.file !== "string" || !c.file.trim()) return null;
  const allowedOps = new Set(["read", "write", "create", "delete", "edit", "unknown"]);
  const allowedSources = new Set(["composer", "human", "tab", "tool", "unknown"]);
  if (typeof c.op !== "string" || !allowedOps.has(c.op)) return null;
  const change: WorkTraceFileChange = {
    file: c.file.trim().slice(0, 180),
    op: c.op as WorkTraceFileChange["op"],
  };
  if (typeof c.source === "string" && allowedSources.has(c.source)) {
    change.source = c.source as WorkTraceFileChange["source"];
  }
  const events = asNonNegInt(c.events, 10_000_000);
  if (events !== undefined && events >= 1) change.events = events;
  return change;
}

export function formatTraceLocation(trace: WorkTrace | null | undefined): string | null {
  const loc = trace?.location;
  if (!loc) return null;
  const repo = loc.repository;
  if (repo?.owner && repo?.name) {
    const host = repo.host && repo.host !== "github.com" ? `${repo.host}/` : "";
    return `${host}${repo.owner}/${repo.name}`;
  }
  if (loc.project) return loc.project;
  return null;
}

export function formatTraceTools(trace: WorkTrace | null | undefined, limit = 6): string | null {
  const tools = trace?.tools;
  if (!tools?.length) return null;
  const shown = tools.slice(0, limit);
  const extra = tools.length - shown.length;
  return extra > 0 ? `${shown.join(" · ")} · +${extra}` : shown.join(" · ");
}

export function formatTraceSkills(trace: WorkTrace | null | undefined, limit = 4): string | null {
  const skills = trace?.skills;
  if (!skills?.length) return null;
  const shown = skills.slice(0, limit);
  const extra = skills.length - shown.length;
  return extra > 0 ? `${shown.join(" · ")} · +${extra}` : shown.join(" · ");
}

export function formatTraceStats(trace: WorkTrace | null | undefined): string | null {
  const stats = trace?.stats;
  if (!stats) return null;
  const parts: string[] = [];
  if (typeof stats.filesChanged === "number" && stats.filesChanged > 0) {
    parts.push(`${stats.filesChanged} file${stats.filesChanged === 1 ? "" : "s"}`);
  }
  if (typeof stats.linesAdded === "number" && stats.linesAdded > 0) {
    parts.push(`+${stats.linesAdded}`);
  }
  if (typeof stats.linesRemoved === "number" && stats.linesRemoved > 0) {
    parts.push(`-${stats.linesRemoved}`);
  }
  return parts.length ? parts.join(" · ") : null;
}

export function formatTraceDuration(trace: WorkTrace | null | undefined): string | null {
  const seconds = trace?.durationSeconds;
  if (typeof seconds !== "number" || seconds <= 0) return null;
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem ? `${hours}h ${rem}m` : `${hours}h`;
}

export function formatTracePhases(trace: WorkTrace | null | undefined): string | null {
  if (trace?.phaseFingerprint?.trim()) return trace.phaseFingerprint.trim();
  if (trace?.phases?.length) return trace.phases.join(">");
  return null;
}

const PHASE_LABELS: Record<string, string> = {
  plan: "Planned",
  explore: "Explored",
  edit: "Edited",
  verify: "Verified",
  commit: "Committed",
  review: "Reviewed",
};

/** Manager-facing phases: "Planned → Explored → Edited → Verified". */
export function formatHumanPhases(trace: WorkTrace | null | undefined): string | null {
  const raw = formatTracePhases(trace);
  if (!raw) return null;
  const parts = raw
    .split(/[>→,|]/)
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);
  if (!parts.length) return null;
  return parts.map((p) => PHASE_LABELS[p] ?? p.charAt(0).toUpperCase() + p.slice(1)).join(" → ");
}

export function humanizeOutcomeStatus(status: string): string {
  switch (status) {
    case "in_progress":
      return "In progress";
    case "verified":
      return "Verified";
    case "committed":
      return "Committed";
    case "abandoned":
      return "Abandoned";
    default:
      return status;
  }
}

export function humanizeAcceptanceStatus(status: string): string {
  switch (status) {
    case "likely_kept":
      return "Likely kept";
    case "mixed":
      return "Mixed";
    case "abandoned":
      return "Abandoned";
    default:
      return "Unknown";
  }
}

const EVIDENCE_TOKEN_LABELS: Record<string, string> = {
  verified_after_edit: "checked after edits",
  rewrite_loop: "several rewrites",
  reprompt: "re-asked",
  after_edit: "after edits",
  lint: "lint",
  test: "tests",
  tests: "tests",
  committed: "committed",
  uncommitted: "uncommitted",
};

/** Turn snake_case evidence tokens into short human phrases. */
export function humanizeEvidenceToken(token: string): string {
  const key = token.trim().toLowerCase();
  if (EVIDENCE_TOKEN_LABELS[key]) return EVIDENCE_TOKEN_LABELS[key];
  return token.replaceAll("_", " ");
}

export function humanizeEvidenceList(tokens: string[] | undefined | null): string | null {
  if (!tokens?.length) return null;
  return tokens.map(humanizeEvidenceToken).join(" · ");
}

export function humanizeFileOp(op: WorkTraceFileChange["op"] | string): string {
  switch (op) {
    case "edit":
      return "Edited";
    case "write":
      return "Wrote";
    case "create":
      return "Created";
    case "delete":
      return "Deleted";
    case "read":
      return "Read";
    default:
      return "Changed";
  }
}

export function humanizeFileSource(source: WorkTraceFileChange["source"] | string | undefined): string | null {
  switch (source) {
    case "composer":
      return "AI";
    case "human":
      return "Human";
    case "tab":
      return "Tab";
    case "tool":
      return "Tool";
    default:
      return null;
  }
}

/** Compact op label; skip "Tool" — only keep meaningful authorship (AI / Human / Tab). */
export function formatFileChangeHint(change: Pick<WorkTraceFileChange, "op" | "source">): string {
  const parts = [humanizeFileOp(change.op)];
  const src = humanizeFileSource(change.source);
  if (src && src !== "Tool") parts.push(src);
  return parts.join(" · ");
}

/**
 * Soft heuristic: long imperative / agent-instruction blobs that pollute
 * manager-facing "the ask". Used only for de-emphasis, never dropped from Evidence.
 */
export function looksLikeSystemInstruction(text: string): boolean {
  const t = text.trim();
  if (t.length < 280) return false;
  const lower = t.toLowerCase();
  const markers = [
    "do not regurgitate",
    "implement the plan as specified",
    "mark todo",
    "todos from the plan",
    "you are an ai",
    "follow these steps carefully",
    "do not edit the plan file",
    "end your response with",
  ];
  if (markers.some((m) => lower.includes(m))) return true;
  const imperativeHits = (lower.match(/\b(do not|must not|always|never|important:|critical:)\b/g) ?? [])
    .length;
  return imperativeHits >= 3 && t.length > 400;
}

/** Pick the first human-looking turn as the hero ask; rest stay available. */
export function pickHeroUserTurnIndex(turns: WorkTraceUserTurn[]): number {
  const idx = turns.findIndex((t) => !looksLikeSystemInstruction(t.text));
  return idx >= 0 ? idx : 0;
}

export type ResolvedChangeNarrative = {
  text: string;
  bullets?: string[];
  source: WorkTraceChangeNarrative["source"] | "overview" | "tldr" | "intent";
  fromTrace: boolean;
};

function looksLikeToolListTldr(s: string): boolean {
  const trimmed = s.trim();
  if (!trimmed) return false;
  if (trimmed.includes(", +")) return true;
  const parts = trimmed.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return false;
  const toolish = parts.filter((p) => {
    if (p.startsWith("+")) return true;
    return /^[A-Za-z][A-Za-z0-9_]*$/.test(p);
  }).length;
  return toolish >= 2 && toolish === parts.length;
}

/**
 * Fallback chain for manager-facing "what landed":
 * changeNarrative → overview → tldr → summaryBullet metadata → high-confidence intent.
 */
export function resolveChangeNarrative(input: {
  trace?: WorkTrace | null;
  overview?: string | null;
  tldr?: string | null;
  title?: string | null;
  metadata?: Record<string, unknown> | null;
}): ResolvedChangeNarrative | null {
  const narrative = input.trace?.changeNarrative;
  if (narrative?.text?.trim()) {
    return {
      text: narrative.text.trim(),
      bullets: narrative.bullets?.length ? narrative.bullets : undefined,
      source: narrative.source,
      fromTrace: true,
    };
  }

  const overview = input.overview?.trim();
  if (overview && overview !== input.title?.trim() && overview !== input.tldr?.trim()) {
    return { text: overview, source: "overview", fromTrace: false };
  }

  const tldr = input.tldr?.trim();
  if (tldr && tldr !== input.title?.trim() && !looksLikeToolListTldr(tldr)) {
    return { text: tldr, source: "tldr", fromTrace: false };
  }

  const bullet = input.metadata?.summaryBullet;
  if (typeof bullet === "string" && bullet.trim()) {
    return { text: bullet.trim(), source: "overview", fromTrace: false };
  }

  const intent = input.trace?.understanding?.intent?.trim();
  const intentConfidence = input.trace?.understanding?.confidence?.intent ?? 0;
  if (intent && intentConfidence >= 0.5) {
    return { text: intent, source: "intent", fromTrace: false };
  }

  return null;
}

/** First sentence / line for the story headline. */
export function changeNarrativeHeadline(text: string, max = 160): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  const sentence = cleaned.match(/^.{1,160}?[.!?](?:\s|$)/);
  const candidate = (sentence?.[0] ?? cleaned).trim();
  if (candidate.length <= max) return candidate;
  return `${candidate.slice(0, max - 1).trimEnd()}…`;
}

export function formatTraceGitSummary(trace: WorkTrace | null | undefined): string | null {
  const git = trace?.git;
  if (!git) return null;
  const parts: string[] = [];
  if (git.branch) parts.push(git.branch);
  if (git.commits?.length) {
    parts.push(`${git.commits.length} commit${git.commits.length === 1 ? "" : "s"}`);
  } else if (git.committed === true) {
    parts.push("committed");
  } else if (git.committed === false) {
    parts.push("uncommitted");
  }
  if (git.prNumber) parts.push(`PR #${git.prNumber}`);
  return parts.length ? parts.join(" · ") : null;
}

const INTENT_CONFIDENCE_FLOOR = 0.5;

/** List one-liner: intent · outcome · aiShare% when confidence is high enough. */
export function formatUnderstandingSummary(trace: WorkTrace | null | undefined): string | null {
  const u = trace?.understanding;
  if (!u) return null;
  const parts: string[] = [];
  const intentOk = (u.confidence?.intent ?? 0) >= INTENT_CONFIDENCE_FLOOR && u.intent?.trim();
  if (intentOk) parts.push(u.intent!.trim());
  if (u.outcome?.status && u.outcome.status !== "unknown" && (u.confidence?.outcome ?? 0) >= 0.4) {
    const label =
      u.outcome.status === "in_progress"
        ? "in progress"
        : u.outcome.status === "committed"
          ? "committed"
          : u.outcome.status === "verified"
            ? "verified"
            : u.outcome.status === "abandoned"
              ? "abandoned"
              : null;
    if (label) parts.push(label);
  }
  if (typeof u.authorship?.aiShare === "number" && (u.confidence?.authorship ?? 0) >= 0.5) {
    parts.push(`${Math.round(u.authorship.aiShare * 100)}% AI edits`);
  }
  return parts.length ? parts.join(" · ") : null;
}

/** Compact list hint: "3 user turns · 12 files" */
export function formatThreadHint(trace: WorkTrace | null | undefined): string | null {
  const parts: string[] = [];
  const turns = trace?.userTurns?.length ?? 0;
  const files = trace?.fileChangelog?.length ?? 0;
  if (turns > 0) parts.push(`${turns} user turn${turns === 1 ? "" : "s"}`);
  if (files > 0) parts.push(`${files} file${files === 1 ? "" : "s"}`);
  return parts.length ? parts.join(" · ") : null;
}

/**
 * Round-robin recent sessions across toolName so one tool (e.g. Codex) cannot
 * bury another (e.g. Cursor) when observedAt skews newer.
 */
export function interleaveByTool<T extends { toolName: string }>(
  sessions: T[],
  opts?: { perTool?: number; take?: number },
): T[] {
  const perTool = Math.max(1, opts?.perTool ?? 20);
  const take = Math.max(1, opts?.take ?? 80);
  const buckets = new Map<string, T[]>();
  for (const session of sessions) {
    const key = session.toolName || "unknown";
    const list = buckets.get(key) ?? [];
    if (list.length < perTool) {
      list.push(session);
      buckets.set(key, list);
    }
  }
  const queues = Array.from(buckets.values());
  const out: T[] = [];
  let progressed = true;
  while (out.length < take && progressed) {
    progressed = false;
    for (const queue of queues) {
      if (!queue.length || out.length >= take) continue;
      out.push(queue.shift()!);
      progressed = true;
    }
  }
  return out;
}
