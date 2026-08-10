import { NextRequest, NextResponse } from "next/server";
import { resolveUsageIngestContext } from "@/lib/ingest/device-context";
import { logServerError } from "@/lib/errors/public";
import { getUsageSyncStatus } from "@/lib/sync/usage-sync";

export const maxDuration = 60;

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: syncRunId } = await context.params;
    const ingestContext = await resolveUsageIngestContext(req, {
      orgId: req.nextUrl.searchParams.get("orgId"),
      userId: req.nextUrl.searchParams.get("userId"),
      deviceId: req.nextUrl.searchParams.get("deviceId"),
    });
    if (ingestContext instanceof NextResponse) return ingestContext;
    const { orgId, deviceId } = ingestContext;

    const status = await getUsageSyncStatus({ orgId, deviceId, syncRunId });
    if (!status) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ ok: true, data: status });
  } catch (error) {
    logServerError("sync/usage/status", error);
    return NextResponse.json({ error: "sync status failed" }, { status: 500 });
  }
}
