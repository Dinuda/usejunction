import type { Session, User } from "next-auth";
import type { JWT } from "next-auth/jwt";
import { prisma } from "@usejunction/db";

type JwtCallbackInput = {
  token: JWT;
  user?: User;
  trigger?: "signIn" | "signUp" | "update";
  session?: unknown;
};

function requestedWorkspace(session: unknown): string | null {
  if (!session || typeof session !== "object") return null;
  const value = session as { orgId?: unknown; user?: { orgId?: unknown } };
  const orgId = value.orgId ?? value.user?.orgId;
  return typeof orgId === "string" && orgId.length > 0 ? orgId : null;
}

export async function applyWorkspaceJwtClaims({
  token,
  user,
  trigger,
  session,
}: JwtCallbackInput): Promise<JWT> {
  if (user) {
    token.userId = user.id;
    token.orgId = user.orgId ?? null;
    token.role = user.role ?? null;

    // OAuth adapter users do not carry workspace claims. Resolve this once
    // during sign-in, never while an established JWT is decoded.
    if (user.id && !token.orgId) {
      const membership = await prisma.organizationMembership.findFirst({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        select: { orgId: true, role: true },
      });
      token.orgId = membership?.orgId ?? null;
      token.role = membership?.role ?? null;
    }
  }

  const orgId = requestedWorkspace(session);
  if (trigger === "update" && orgId && token.userId) {
    const membership = await prisma.organizationMembership.findUnique({
      where: {
        userId_orgId: {
          userId: String(token.userId),
          orgId,
        },
      },
      select: { orgId: true, role: true },
    });
    if (membership) {
      token.orgId = membership.orgId;
      token.role = membership.role;
    }
  }

  return token;
}

export function exposeWorkspaceSessionClaims({
  session,
  token,
}: {
  session: Session;
  token: JWT;
}): Session {
  if (session.user && token.userId) {
    session.user.id = String(token.userId);
    session.user.orgId = token.orgId ? String(token.orgId) : null;
    session.user.role = token.role ? String(token.role) : null;
  }
  return session;
}
