import { NextResponse } from "next/server";
import { notifyServerIssue } from "@/lib/notifications/slack";

/** Log a full error on the server console and fan out to Slack. Never send this to the browser. */
export function logServerError(
  scope: string,
  error: unknown,
  details?: Record<string, unknown>,
) {
  if (details) console.error(`[${scope}]`, error, details);
  else console.error(`[${scope}]`, error);
  notifyServerIssue({ severity: "error", scope, error, details });
}

/** Log a warning on the server console and fan out to Slack. */
export function logServerWarn(
  scope: string,
  message: unknown,
  details?: Record<string, unknown>,
) {
  if (details) console.warn(`[${scope}]`, message, details);
  else console.warn(`[${scope}]`, message);
  notifyServerIssue({ severity: "warning", scope, error: message, details });
}

/** Safe JSON error for clients — details stay on the server console / Slack. */
export function publicErrorResponse(
  scope: string,
  error: unknown,
  message: string,
  status: number,
) {
  logServerError(scope, error);
  return NextResponse.json({ error: message }, { status });
}
