import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { ACTIVE_ORG_COOKIE } from "@/lib/require-organization";
import { browserMutationGuard, limitedJson } from "@/lib/security/http";
import { syncSessionWorkspace } from "@/lib/workspace-session";

const schema = z.object({
  orgId: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const rejected = browserMutationGuard(req);
  if (rejected) return rejected;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await limitedJson(req, 1024);
  if (!body.ok) return body.response;
  const parsed = schema.safeParse(body.data);
  if (!parsed.success) return NextResponse.json({ error: "orgId required" }, { status: 400 });

  const synced = await syncSessionWorkspace(session.user.id, parsed.data.orgId);
  if (!synced.ok) {
    return NextResponse.json({ error: synced.error }, { status: synced.status });
  }

  const response = NextResponse.json({
    orgId: synced.orgId,
    role: synced.role,
    name: synced.name,
  });
  response.cookies.delete(ACTIVE_ORG_COOKIE);
  return response;
}
