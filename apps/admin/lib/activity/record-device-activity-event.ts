import { prisma, type Prisma } from "@usejunction/db";

export const DEVICE_ACTIVITY_RETENTION_DAYS = 30;
export const DEVICE_ACTIVITY_JSON_CAP_BYTES = 32_768;
export const DEVICE_ACTIVITY_SAMPLE_LIMIT = 8;

const SECRET_KEY_PATTERN =
  /^(.*(?:token|secret|password|authorization|bearer|cookie|credential).*)$/i;

export type DeviceActivityKind =
  | "heartbeat"
  | "tools"
  | "accounts"
  | "quota"
  | "local_models"
  | "usage"
  | "work_sessions"
  | "signals_sessions"
  | "agent_update_check"
  | "agent_update";

export type RecordDeviceActivityEventInput = {
  orgId: string;
  developerId: string;
  deviceId: string;
  kind: DeviceActivityKind | string;
  direction?: "ingest" | "directive" | "observed";
  status: "ok" | "error" | string;
  summary: string;
  requestSummary?: unknown;
  responseSummary?: unknown;
  errorCode?: string | null;
  durationMs?: number | null;
  occurredAt?: Date;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function redactValue(key: string, value: unknown): unknown {
  if (SECRET_KEY_PATTERN.test(key)) return "[redacted]";
  return value;
}

/** Strip secrets and truncate nested payloads for safe inspect storage. */
export function sanitizeActivityPayload(
  value: unknown,
  options: { maxBytes?: number; sampleLimit?: number } = {},
): Prisma.InputJsonValue {
  const maxBytes = options.maxBytes ?? DEVICE_ACTIVITY_JSON_CAP_BYTES;
  const sampleLimit = options.sampleLimit ?? DEVICE_ACTIVITY_SAMPLE_LIMIT;

  function walk(input: unknown, depth: number): unknown {
    if (input == null) return null;
    if (typeof input === "string") return input.length > 500 ? `${input.slice(0, 500)}…` : input;
    if (typeof input === "number" || typeof input === "boolean") return input;
    if (typeof input === "bigint") return Number(input);
    if (input instanceof Date) return input.toISOString();
    if (depth > 6) return "[truncated]";

    if (Array.isArray(input)) {
      const sliced = input.slice(0, sampleLimit).map((item) => walk(item, depth + 1));
      if (input.length > sampleLimit) {
        return [...sliced, { _truncated: input.length - sampleLimit }];
      }
      return sliced;
    }

    if (isPlainObject(input)) {
      const out: Record<string, unknown> = {};
      for (const [key, raw] of Object.entries(input)) {
        out[key] = walk(redactValue(key, raw), depth + 1);
      }
      return out;
    }

    return String(input).slice(0, 200);
  }

  let sanitized = walk(value, 0);
  let encoded = JSON.stringify(sanitized ?? null) ?? "null";
  if (encoded.length > maxBytes) {
    sanitized = {
      truncated: true,
      preview: encoded.slice(0, Math.max(0, maxBytes - 64)),
    };
    encoded = JSON.stringify(sanitized);
  }

  return JSON.parse(encoded) as Prisma.InputJsonValue;
}

export function uniqueStrings(values: Array<string | null | undefined>, limit = 12): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const clean = value?.trim();
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
    if (out.length >= limit) break;
  }
  return out;
}

export function compactNumber(value: number): string {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

/** Best-effort append-only activity log. Never throws to callers. */
export async function recordDeviceActivityEvent(input: RecordDeviceActivityEventInput): Promise<void> {
  try {
    await prisma.deviceActivityEvent.create({
      data: {
        orgId: input.orgId,
        developerId: input.developerId,
        deviceId: input.deviceId,
        kind: input.kind.slice(0, 64),
        direction: (input.direction ?? "ingest").slice(0, 32),
        status: input.status.slice(0, 32),
        summary: input.summary.slice(0, 500),
        requestSummary: sanitizeActivityPayload(input.requestSummary ?? {}),
        responseSummary: sanitizeActivityPayload(input.responseSummary ?? {}),
        errorCode: input.errorCode ? input.errorCode.slice(0, 128) : null,
        durationMs: input.durationMs ?? null,
        occurredAt: input.occurredAt ?? new Date(),
      },
    });
  } catch (error) {
    console.error("[device-activity] record failed", error);
  }
}

export async function enforceDeviceActivityRetention(
  orgId: string,
  retentionDays = DEVICE_ACTIVITY_RETENTION_DAYS,
): Promise<number> {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  const result = await prisma.deviceActivityEvent.deleteMany({
    where: { orgId, occurredAt: { lt: cutoff } },
  });
  return result.count;
}
