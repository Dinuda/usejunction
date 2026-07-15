import { NextRequest, NextResponse } from "next/server";
import { materializeActiveOrgs } from "@/lib/analytics/materialize-metric-buckets";
import { verifyConfiguredBearer } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret === "development-cron") {
    return NextResponse.json({ error: "CRON_SECRET is not securely configured" }, { status: 503 });
  }
  if (!verifyConfiguredBearer(req, secret, ["development-cron"])) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const results = await materializeActiveOrgs({ limit: 50 });
    return NextResponse.json({
      orgs: results.length,
      results,
    });
  } catch (error) {
    console.error("[cron/materialize-metrics]", error);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
