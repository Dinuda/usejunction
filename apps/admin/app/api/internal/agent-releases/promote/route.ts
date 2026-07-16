import { NextRequest, NextResponse } from "next/server";
import { agentReleaseManifestSchema, promoteAgentRelease } from "@/lib/agent-updates";
import { requireAgentReleaseOps } from "@/lib/agent-updates/ops-auth";

export async function POST(req: NextRequest) {
  const auth = requireAgentReleaseOps(req);
  if (auth !== true) return auth;
  const body = await req.json().catch(() => ({}));
  const parsed = agentReleaseManifestSchema.safeParse(body.manifest ?? body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid release manifest", issues: parsed.error.issues }, { status: 400 });
  }
  try {
    const result = await promoteAgentRelease(parsed.data);
    return NextResponse.json({ ok: true, releaseId: result.release.id, version: result.release.version, cohortSize: result.cohortSize });
  } catch (error) {
    if (error instanceof Error && error.message === "RELEASE_ARTIFACTS_IMMUTABLE") {
      return NextResponse.json({ error: "release artifacts are immutable; publish a newer version" }, { status: 409 });
    }
    console.error("[agent-release/promote]", error);
    return NextResponse.json({ error: "release promotion failed" }, { status: 500 });
  }
}
