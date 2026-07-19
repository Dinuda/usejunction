import { createHash, randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { Prisma, prisma } from "@usejunction/db";
import { getWorkspaceContext } from "@/lib/workspace-context";

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateDeviceToken(): string {
  return `uj_dev_${randomBytes(32).toString("hex")}`;
}

function legacyDeviceTokenPlaceholder(deviceId: string): string {
  return `rotated:${deviceId}:${randomBytes(16).toString("hex")}`;
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

export async function findDeviceByBearerToken<T extends Prisma.DeviceFindFirstArgs>(
  req: NextRequest,
  args: T,
): Promise<Prisma.DeviceGetPayload<T> | null> {
  const token = bearerToken(req);
  if (!token) return null;
  return findDeviceByTokenValue(token, args);
}

export async function findDeviceByTokenValue<T extends Prisma.DeviceFindFirstArgs>(
  token: string,
  args: T,
): Promise<Prisma.DeviceGetPayload<T> | null> {
  const tokenHash = hashToken(token);
  const where = args.where ? { AND: [args.where, { OR: [{ deviceTokenHash: tokenHash }, { deviceToken: token }] }] } : { OR: [{ deviceTokenHash: tokenHash }, { deviceToken: token }] };
  const device = await prisma.device.findFirst({ ...args, where } as Prisma.DeviceFindFirstArgs) as Prisma.DeviceGetPayload<T> | null;
  const id = (device as { id?: string } | null)?.id;
  if (id) {
    void backfillLegacyDeviceTokenHash(id, token, tokenHash).catch((error) => {
      console.error("[device-auth/backfill]", error);
    });
  }
  return device;
}

async function backfillLegacyDeviceTokenHash(deviceId: string, token: string, tokenHash: string) {
  await prisma.device.updateMany({
    where: { id: deviceId, deviceToken: token, deviceTokenHash: null },
    data: { deviceTokenHash: tokenHash, deviceToken: legacyDeviceTokenPlaceholder(deviceId) },
  });
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
