import { NextRequest, NextResponse } from "next/server";
import { verifyConfiguredBearer } from "@/lib/auth";
import { claimDueConnections, syncConnection } from "@/lib/integrations/sync";

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret === "development-cron") {
    return NextResponse.json({ error: "CRON_SECRET is not securely configured" }, { status: 503 });
  }
  if (!verifyConfiguredBearer(req, secret, ["development-cron"])) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const connectionIds = await claimDueConnections(5);
  const results = [];
  for (const id of connectionIds) {
    try {
      results.push({ id, ok: true, counts: await syncConnection(id) });
    } catch (error) {
      results.push({ id, ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return NextResponse.json({ claimed: connectionIds.length, results });
}
