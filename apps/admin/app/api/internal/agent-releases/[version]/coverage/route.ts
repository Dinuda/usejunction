import { NextRequest, NextResponse } from "next/server";
import { getPlatformAgentUpdateCoverage } from "@/lib/agent-updates";
import { requireAgentReleaseOps } from "@/lib/agent-updates/ops-auth";

export async function GET(req: NextRequest, { params }: { params: Promise<{ version: string }> }) {
  const auth = requireAgentReleaseOps(req);
  if (auth !== true) return auth;
  const { version } = await params;
  const coverage = await getPlatformAgentUpdateCoverage(version);
  if (!coverage) return NextResponse.json({ error: "release not found" }, { status: 404 });
  return NextResponse.json(coverage);
}
