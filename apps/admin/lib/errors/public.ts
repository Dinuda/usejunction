import { NextResponse } from "next/server";

/** Log a full error on the server console. Never send this to the browser. */
export function logServerError(scope: string, error: unknown) {
  console.error(`[${scope}]`, error);
}

/** Safe JSON error for clients — details stay on the server console. */
export function publicErrorResponse(
  scope: string,
  error: unknown,
  message: string,
  status: number,
) {
  logServerError(scope, error);
  return NextResponse.json({ error: message }, { status });
}
