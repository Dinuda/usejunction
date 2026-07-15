import { createHash, randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { constantTimeHashMatch, hashOpaqueToken } from "@/lib/security";
import { getWorkspaceContext } from "@/lib/workspace-context";

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateDeviceToken(): string {
  return `uj_dev_${randomBytes(32).toString("hex")}`;
}

export function generateEnrollmentToken(): string {
  return `uj_enroll_${randomBytes(24).toString("hex")}`;
}

export function getDefaultOrgId(): string {
  return process.env.DEFAULT_ORG_ID || "seed-org";
}

export function verifyIngestAuth(req: NextRequest): { orgId: string } | null {
  const auth = req.headers.get("authorization");
  const secret = process.env.INGEST_SECRET;
  const orgId = process.env.INGEST_ORG_ID || process.env.DEFAULT_ORG_ID;
  if (!secret || !orgId || !auth?.startsWith("Bearer ")) return null;
  if (process.env.NODE_ENV === "production" && secret === "change-me-ingest-secret") return null;
  return constantTimeHashMatch(auth.slice(7), hashOpaqueToken(secret)) ? { orgId } : null;
}

export async function requireAdminSession(
  _req: NextRequest
): Promise<{ email: string; userId: string; orgId: string | null; role: string | null } | NextResponse> {
  const ctx = await getWorkspaceContext();
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  return { email: ctx.email, userId: ctx.userId, orgId: ctx.orgId, role: ctx.role };
}

export function requireIngestAuth(req: NextRequest): { orgId: string } | NextResponse {
  const context = verifyIngestAuth(req);
  if (!context) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return context;
}

export function bearerToken(req: NextRequest): string | null {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  return auth.slice(7);
}

export function verifyConfiguredBearer(
  req: NextRequest,
  secret: string | undefined,
  forbiddenValues: readonly string[] = [],
): boolean {
  const token = bearerToken(req);
  if (!secret || !token || forbiddenValues.includes(secret)) return false;
  return constantTimeHashMatch(token, hashOpaqueToken(secret));
}
