import { prisma } from "@usejunction/db";
import {
  assertInsightRoles,
  makeInsightEnvelope,
  type InsightContext,
  type InsightEnvelope,
} from "@/lib/insights/contracts/envelope";
import { getOrgSignalsPolicy } from "@/lib/signals/service";
import {
  formatTraceLocation,
  parseWorkTrace,
  type WorkTrace,
} from "@/lib/signals/work-trace";
import { audit } from "@/lib/rbac";
import { rolesFor } from "@/lib/rbac/permissions";

export type WorkSessionDetail = {
  id: string;
  localId: string;
  toolName: string;
  model: string | null;
  mode: string | null;
  title: string | null;
  tldr: string | null;
  overview: string | null;
  startedAt: string | null;
  endedAt: string | null;
  observedAt: string;
  source: string;
  toolCallCounts: Record<string, number> | null;
  trace: WorkTrace | null;
  repository: { host?: string | null; owner?: string | null; name?: string | null } | null;
  locationLabel: string | null;
  developer: {
    id: string;
    name: string;
    email: string;
  };
  device: {
    id: string;
    hostname: string;
  } | null;
};

function asCounts(value: unknown): Record<string, number> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const out: Record<string, number> = {};
  for (const [key, count] of Object.entries(value)) {
    if (typeof count === "number" && Number.isFinite(count) && count > 0) {
      out[key] = count;
    }
  }
  return Object.keys(out).length ? out : null;
}

function asRepository(value: unknown): WorkSessionDetail["repository"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const host = typeof raw.host === "string" ? raw.host : null;
  const owner = typeof raw.owner === "string" ? raw.owner : null;
  const name = typeof raw.name === "string" ? raw.name : null;
  if (!host && !owner && !name) return null;
  return { host, owner, name };
}

export async function getWorkSessionDetail(
  context: InsightContext,
  sessionId: string,
): Promise<InsightEnvelope<WorkSessionDetail> | null> {
  assertInsightRoles(context, rolesFor("org_overview"));
  const policy = await getOrgSignalsPolicy(context.orgId);
  if (!policy.workExtractionEnabled) return null;

  const row = await prisma.localWorkSession.findFirst({
    where: { id: sessionId, orgId: context.orgId },
    select: {
      id: true,
      localId: true,
      toolName: true,
      model: true,
      mode: true,
      title: true,
      tldr: true,
      overview: true,
      startedAt: true,
      endedAt: true,
      observedAt: true,
      source: true,
      toolCallCounts: true,
      trace: true,
      repository: true,
      developer: { select: { id: true, name: true, email: true, authUserId: true } },
      device: { select: { id: true, hostname: true } },
    },
  });
  if (!row) return null;

  const trace = parseWorkTrace(row.trace);
  const canSeeRawTrace = context.actorId === row.developer.authUserId || context.roles.includes("owner") || context.roles.includes("admin");
  const visibleTrace = canSeeRawTrace
    ? trace
    : trace
      ? { ...trace, userTurns: undefined }
      : null;
  if (visibleTrace?.userTurns?.length) {
    await audit({
      orgId: context.orgId,
      actorType: "user",
      actorId: context.actorId,
      action: "work_session.raw_trace_viewed",
      targetType: "local_work_session",
      targetId: row.id,
      metadata: { developerId: row.developer.id },
    });
  }
  const repository = asRepository(row.repository) ?? visibleTrace?.location?.repository ?? null;

  return makeInsightEnvelope({
    context,
    kind: "work-session-detail",
    window: {
      from: row.observedAt,
      to: row.observedAt,
      timezone: context.timezone,
      grain: "day",
    },
    dataThrough: row.observedAt,
    data: {
      id: row.id,
      localId: row.localId,
      toolName: row.toolName,
      model: row.model,
      mode: row.mode,
      title: row.title,
      tldr: row.tldr,
      overview: row.overview,
      startedAt: row.startedAt?.toISOString() ?? null,
      endedAt: row.endedAt?.toISOString() ?? null,
      observedAt: row.observedAt.toISOString(),
      source: row.source,
      toolCallCounts: asCounts(row.toolCallCounts),
      trace: visibleTrace,
      repository,
      locationLabel: formatTraceLocation(trace) ?? (repository?.owner && repository?.name
        ? `${repository.owner}/${repository.name}`
        : repository?.name ?? null),
      developer: { id: row.developer.id, name: row.developer.name, email: row.developer.email },
      device: row.device,
    },
  });
}

export { displayWorkTitle, workSessionPath } from "@/lib/signals/work-display";
