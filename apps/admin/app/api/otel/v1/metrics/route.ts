import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma, type Prisma } from "@usejunction/db";
import { markAnalyticsDirtyDay } from "@/lib/analytics/dirty-days";
import { hashOpaqueToken } from "@/lib/security";

type Row = Record<string, any>;
const ALLOWED_METRICS = new Set([
  "claude_code.session.count",
  "claude_code.lines_of_code.count",
  "claude_code.pull_request.count",
  "claude_code.commit.count",
  "claude_code.cost.usage",
  "claude_code.token.usage",
  "claude_code.active_time.total",
]);
const ALLOWED_ATTRIBUTES = new Set(["organization.id", "user.account_uuid", "user.account_id", "user.email", "user.id", "terminal.type", "app.version", "model", "type"]);

function anyValue(value: Row | undefined): unknown {
  if (!value) return undefined;
  for (const key of ["stringValue", "intValue", "doubleValue", "boolValue"]) if (value[key] !== undefined) return value[key];
  return undefined;
}

function attrs(rows: Row[] | undefined) {
  const output: Record<string, unknown> = {};
  for (const row of rows ?? []) if (ALLOWED_ATTRIBUTES.has(row.key)) output[row.key] = anyValue(row.value);
  return output;
}

function pointValue(point: Row) {
  const raw = point.asInt ?? point.asDouble ?? point.value ?? 0;
  const value = Number(raw);
  return Number.isFinite(value) ? value : 0;
}

function pointDate(point: Row) {
  try {
    if (point.timeUnixNano) return new Date(Number(BigInt(String(point.timeUnixNano)) / BigInt(1_000_000)));
  } catch {}
  return new Date();
}

function dateOnly(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function safeJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? {})) as Prisma.InputJsonValue;
}

async function resolveOtelAuth(bearer: string) {
  const token = bearer.slice(7);
  const endpoint = await prisma.telemetryEndpoint.findUnique({
    where: { tokenHash: hashOpaqueToken(token) },
    select: { orgId: true, enabled: true },
  });
  if (endpoint?.enabled) {
    return { orgId: endpoint.orgId, defaultDeveloperId: null as string | null };
  }
  const device = await prisma.device.findUnique({
    where: { deviceTokenHash: hashOpaqueToken(token) },
    select: { orgId: true, userId: true },
  });
  if (!device) return null;
  return { orgId: device.orgId, defaultDeveloperId: device.userId };
}

export async function POST(req: NextRequest) {
  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > 1_048_576) return NextResponse.json({ error: "payload too large" }, { status: 413 });
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const authContext = await resolveOtelAuth(auth);
  if (!authContext) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const text = await req.text();
  if (text.length > 1_048_576) return NextResponse.json({ error: "payload too large" }, { status: 413 });
  let body: Row;
  try {
    body = JSON.parse(text) as Row;
  } catch {
    return NextResponse.json({ error: "OTLP HTTP/JSON payload required" }, { status: 400 });
  }

  let accepted = 0;
  let discarded = 0;
  for (const resourceMetric of body.resourceMetrics ?? []) {
    const resourceAttributes = attrs(resourceMetric.resource?.attributes);
    for (const scopeMetric of resourceMetric.scopeMetrics ?? []) {
      for (const metric of scopeMetric.metrics ?? []) {
        if (!ALLOWED_METRICS.has(metric.name)) { discarded += 1; continue; }
        const points: Row[] = metric.sum?.dataPoints ?? metric.gauge?.dataPoints ?? [];
        for (const point of points.slice(0, 10_000)) {
          const attributes = { ...resourceAttributes, ...attrs(point.attributes) };
          const accountId = String(attributes["user.account_id"] ?? attributes["user.account_uuid"] ?? attributes["user.id"] ?? "");
          const developerId: string | null = authContext.defaultDeveloperId;
          const observed = pointDate(point);
          const metricValue = pointValue(point);
          const metricType = String(attributes.type ?? "").toLowerCase();
          const fingerprint = createHash("sha256").update(JSON.stringify({ metric: metric.name, time: point.timeUnixNano, start: point.startTimeUnixNano, accountId, attributes, metricValue })).digest("hex");
          const values = {
            requests: 0, sessions: metric.name === "claude_code.session.count" ? Math.round(metricValue) : 0,
            inputTokens: metric.name === "claude_code.token.usage" && metricType === "input" ? BigInt(Math.max(0, Math.round(metricValue))) : BigInt(0),
            outputTokens: metric.name === "claude_code.token.usage" && metricType === "output" ? BigInt(Math.max(0, Math.round(metricValue))) : BigInt(0),
            cacheReadTokens: metric.name === "claude_code.token.usage" && metricType.includes("cache") ? BigInt(Math.max(0, Math.round(metricValue))) : BigInt(0),
            activeSeconds: metric.name === "claude_code.active_time.total" ? BigInt(Math.max(0, Math.round(metricValue))) : BigInt(0),
            addedLines: metric.name === "claude_code.lines_of_code.count" && metricType === "added" ? BigInt(Math.max(0, Math.round(metricValue))) : BigInt(0),
            deletedLines: metric.name === "claude_code.lines_of_code.count" && metricType === "removed" ? BigInt(Math.max(0, Math.round(metricValue))) : BigInt(0),
            commits: metric.name === "claude_code.commit.count" ? Math.max(0, Math.round(metricValue)) : 0,
            pullRequests: metric.name === "claude_code.pull_request.count" ? Math.max(0, Math.round(metricValue)) : 0,
            costMicros: metric.name === "claude_code.cost.usage" ? BigInt(Math.max(0, Math.round(metricValue * 1_000_000))) : BigInt(0),
          };
          await prisma.usageDaily.upsert({
            where: { orgId_dedupeKey: { orgId: authContext.orgId, dedupeKey: `otel:${fingerprint}` } },
            update: { developerId, observedAt: observed, ...values },
            create: {
              orgId: authContext.orgId, developerId, date: dateOnly(observed), provider: "anthropic", product: "claude_code",
              toolName: "claude-code", model: String(attributes.model ?? ""), source: "otel_observed", sourceRef: fingerprint, verified: false,
              dedupeKey: `otel:${fingerprint}`, observedAt: observed, metadata: safeJson(attributes), ...values,
            },
          });
          await markAnalyticsDirtyDay(authContext.orgId, dateOnly(observed));
          accepted += 1;
        }
      }
    }
  }
  return NextResponse.json({ partialSuccess: { accepted, discarded } });
}
