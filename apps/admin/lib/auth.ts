import { createHash, randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
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

export function verifyIngestAuth(req: NextRequest): boolean {
  const auth = req.headers.get("authorization");
  const secret = process.env.INGEST_SECRET;
  if (!secret) return false;
  if (process.env.NODE_ENV === "production" && secret === "change-me-ingest-secret" && process.env.USEJUNCTION_ALLOW_INSECURE_DEVELOPMENT !== "true") return false;
  return auth === `Bearer ${secret}`;
}

export function verifyDeviceTokenHeader(req: NextRequest, deviceToken: string): boolean {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return false;
  return auth.slice(7) === deviceToken;
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

export async function requireDeviceAuth(
  req: NextRequest,
  deviceToken: string
): Promise<true | NextResponse> {
  if (!verifyDeviceTokenHeader(req, deviceToken)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return true;
}

export function requireIngestAuth(req: NextRequest): true | NextResponse {
  if (!verifyIngestAuth(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return true;
}

export function bearerToken(req: NextRequest): string | null {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  return auth.slice(7);
}
