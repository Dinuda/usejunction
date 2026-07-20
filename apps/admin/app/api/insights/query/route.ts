import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@usejunction/db";
import { ZodError } from "zod";
import { executeUsageQuery, type AnalyticsScope } from "@/lib/analytics/query";
import { requireOrgRole, rolesFor } from "@/lib/rbac";
import { logServerError } from "@/lib/errors/public";

export async function POST(req: NextRequest) {
  const auth = await requireOrgRole(req, rolesFor("self_view"));
  if (auth instanceof NextResponse) return auth;

  const scope: AnalyticsScope = {
    orgId: auth.orgId,
    actorId: auth.userId,
    role: auth.role,
  };

  if (auth.role === "user") {
    const developer = await prisma.developer.findFirst({
      where: { orgId: auth.orgId, authUserId: auth.userId },
      select: { id: true },
    });
    if (!developer) return NextResponse.json({ error: "developer identity required" }, { status: 403 });
    scope.developerId = developer.id;
  }

  try {
    const body = await req.json();
    return NextResponse.json(await executeUsageQuery(scope, body));
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "invalid query", details: error.flatten() }, { status: 400 });
    }
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
    }
    if (error instanceof Error && (
      error.message.startsWith("Invalid UTC date") ||
      error.message.startsWith("Query window") ||
      error.message.startsWith("orderBy field")
    )) {
      logServerError("insights/query", error, { kind: "invalid query" });
      return NextResponse.json({ error: "invalid query" }, { status: 400 });
    }
    logServerError("insights/query", error);
    return NextResponse.json({ error: "query failed" }, { status: 500 });
  }
}
