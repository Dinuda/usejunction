import { NextRequest, NextResponse } from "next/server";
import { pauseAgentRelease } from "@/lib/agent-updates";
import { requireAgentReleaseOps } from "@/lib/agent-updates/ops-auth";

export async function POST(req: NextRequest) {
  const auth = requireAgentReleaseOps(req);
  if (auth !== true) return auth;
  const body = await req.json().catch(() => ({}));
  const version = typeof body.version === "string" ? body.version.trim() : "";
  if (!version) return NextResponse.json({ error: "version required" }, { status: 400 });
  try {
    const release = await pauseAgentRelease(version);
    return NextResponse.json({ ok: true, releaseId: release.id, version: release.version, status: release.status });
  } catch (error) {
    console.error("[agent-release/pause]", error);
    return NextResponse.json({ error: "release pause failed" }, { status: 500 });
  }
}
