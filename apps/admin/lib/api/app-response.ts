import { randomUUID } from "crypto";
import { NextResponse } from "next/server";

export type AppApiMeta = { generatedAt: string; requestId: string };
export type AppApiSuccess<T> = { data: T; meta: AppApiMeta };
export type AppApiFailure = { error: { code: string; message: string }; meta: AppApiMeta };

export function jsonSafe<T>(value: T): T {
  if (typeof value === "bigint") return value.toString() as T;
  if (value instanceof Date) return value.toISOString() as T;
  if (Array.isArray(value)) return value.map(jsonSafe) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, jsonSafe(item)]),
    ) as T;
  }
  return value;
}

function privateHeaders(requestId: string, serverTiming?: string) {
  const headers = new Headers({
    "cache-control": "private, no-store, max-age=0",
    pragma: "no-cache",
    "x-request-id": requestId,
  });
  if (serverTiming) headers.set("server-timing", serverTiming);
  return headers;
}

export function appData<T>(data: T, options: { requestId?: string; serverTiming?: string } = {}) {
  const requestId = options.requestId ?? randomUUID();
  return NextResponse.json<AppApiSuccess<T>>(
    { data: jsonSafe(data), meta: { generatedAt: new Date().toISOString(), requestId } },
    { headers: privateHeaders(requestId, options.serverTiming) },
  );
}

export function appError(code: string, message: string, status: number, requestId = randomUUID()) {
  return NextResponse.json<AppApiFailure>(
    { error: { code, message }, meta: { generatedAt: new Date().toISOString(), requestId } },
    { status, headers: privateHeaders(requestId) },
  );
}

export function timingHeader(parts: Record<string, number>) {
  return Object.entries(parts)
    .map(([name, duration]) => `${name};dur=${Math.max(0, duration).toFixed(1)}`)
    .join(", ");
}
