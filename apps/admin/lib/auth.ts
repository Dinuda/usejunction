import { createHash, randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, COOKIE_NAME } from "./session-edge";

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
  const secret = process.env.INGEST_SECRET || "change-me-ingest-secret";
  return auth === `Bearer ${secret}`;
}

export function verifyDeviceTokenHeader(req: NextRequest, deviceToken: string): boolean {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return false;
  return auth.slice(7) === deviceToken;
}

export async function requireAdminSession(
  req: NextRequest
): Promise<{ email: string } | NextResponse> {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  const email = token ? await verifySessionToken(token) : null;
  if (!email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return { email };
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
