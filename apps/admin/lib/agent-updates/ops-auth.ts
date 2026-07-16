import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

export function requireAgentReleaseOps(req: NextRequest): true | NextResponse {
  const expected = process.env.AGENT_RELEASE_OPERATIONS_TOKEN?.trim();
  const authorization = req.headers.get("authorization") ?? "";
  const provided = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!expected || expected.length !== provided.length) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!timingSafeEqual(Buffer.from(expected), Buffer.from(provided))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return true;
}
