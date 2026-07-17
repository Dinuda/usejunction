import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { isAuthUserNotFoundError } from "@/lib/ensure-auth-user";
import { createWorkspace } from "@/lib/ensure-workspace";
import { ACTIVE_ORG_COOKIE, activeOrgCookieOptions } from "@/lib/require-organization";
import { audit } from "@/lib/rbac";
import { WORKSPACE_COLORS } from "@/lib/workspace-colors";

const schema = z.object({
  name: z.string().trim().min(1).max(80),
  color: z.enum(WORKSPACE_COLORS).optional(),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "workspace name required" }, { status: 400 });
  }

  let result;
  try {
    result = await createWorkspace(
      {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
      },
      { name: parsed.data.name, color: parsed.data.color },
    );
  } catch (error) {
    if (isAuthUserNotFoundError(error)) {
      return NextResponse.json({ error: "session_expired" }, { status: 401 });
    }
    throw error;
  }

  await audit({
    orgId: result.orgId,
    actorType: "user",
    actorId: session.user.id,
    action: "workspace.created",
    targetType: "organization",
    targetId: result.orgId,
    metadata: { name: result.name, slug: result.slug, color: result.color },
  });

  const response = NextResponse.json(
    {
      orgId: result.orgId,
      name: result.name,
      slug: result.slug,
      color: result.color,
      role: result.role,
    },
    { status: 201 },
  );
  response.cookies.set(ACTIVE_ORG_COOKIE, result.orgId, activeOrgCookieOptions());
  return response;
}
