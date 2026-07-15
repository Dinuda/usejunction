import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@usejunction/db";
import { ZodError } from "zod";
import { executeUsageQuery, type AnalyticsScope } from "@/lib/analytics/query";
import { requireOrgRole } from "@/lib/rbac";

export async function POST(req: NextRequest) {
  const auth = await requireOrgRole(req, ["owner", "admin", "developer"]);
  if (auth instanceof NextResponse) return auth;

  const scope: AnalyticsScope = {
    orgId: auth.orgId,
    actorId: auth.userId,
    role: auth.role,
  };

  if (auth.role === "developer") {
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
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("[insights/query]", error);
    return NextResponse.json({ error: "query failed" }, { status: 500 });
  }
}
