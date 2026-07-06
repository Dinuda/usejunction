import { createHash, randomBytes } from "crypto";
import { NextRequest } from "next/server";

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function generateDeviceToken() {
  return `uj_dev_${randomBytes(32).toString("hex")}`;
}

export function generateEnrollmentToken() {
  return `uj_enroll_${randomBytes(24).toString("hex")}`;
}

export function verifyIngestAuth(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = process.env.INGEST_SECRET || "change-me-ingest-secret";
  return auth === `Bearer ${secret}`;
}

export function verifyDeviceAuth(req: NextRequest, deviceToken?: string | null) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return false;
  const token = auth.slice(7);
  return token === deviceToken;
}

export function getDefaultOrgId() {
  return "seed-org";
}
