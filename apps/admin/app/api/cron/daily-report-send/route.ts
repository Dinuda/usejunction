import { NextRequest, NextResponse } from "next/server";
import { logServerError } from "@/lib/errors/public";
import { runDailyReportSend } from "@/lib/reports/daily-report-send";

function authorizeCron(req: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  }
  if (
    process.env.NODE_ENV === "production" &&
    secret === "development-cron" &&
    process.env.USEJUNCTION_ALLOW_INSECURE_DEVELOPMENT !== "true"
  ) {
    return NextResponse.json({ error: "a non-default CRON_SECRET is required" }, { status: 503 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret || "development-cron"}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}

function devTestFlags(req: NextRequest): { ignoreHour: boolean; resend: boolean } {
  if (process.env.NODE_ENV === "production") {
    return { ignoreHour: false, resend: false };
  }
  const url = req.nextUrl ?? new URL(req.url);
  const force = url.searchParams.get("force") === "1";
  const resend = url.searchParams.get("resend") === "1";
  return { ignoreHour: force, resend };
}

/**
 * Sends 19:00-local daily report emails with a PDF attachment.
 * Separate from usage-daily-refresh (UTC seal / agent full rescan).
 *
 * Local testing (non-production only):
 *   ?force=1  — ignore the 19:00 local hour gate
 *   ?resend=1 — send again even if already delivered today
 */
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const denied = authorizeCron(req);
  if (denied) return denied;

  const flags = devTestFlags(req);

  try {
    const result = await runDailyReportSend(new Date(), flags);
    return NextResponse.json({
      ok: true,
      ...result,
      ...(process.env.NODE_ENV !== "production" && (flags.ignoreHour || flags.resend)
        ? { testMode: flags }
        : {}),
    });
  } catch (error) {
    logServerError("cron/daily-report-send", error);
    return NextResponse.json({ error: "daily report send failed" }, { status: 500 });
  }
}
