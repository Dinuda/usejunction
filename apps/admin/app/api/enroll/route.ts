import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@usejunction/db";
import { generateDeviceToken } from "@/lib/auth";
import { commercialFeatures } from "@/lib/commercial/provider";
import { getPublicAppUrl } from "@/lib/public-url";
import { enforceRateLimit } from "@/lib/rate-limit";
import { hashOpaqueToken } from "@/lib/security";

export async function POST(req: NextRequest) {
  const limited = enforceRateLimit(req, "device-enroll", { limit: 20, windowMs: 15 * 60 * 1000 });
  if (limited) return limited;
  try {
    const body = await req.json();
    const { token, hostname, os, architecture, agentVersion } = body;

    if (!token) {
      return NextResponse.json({ error: "token required" }, { status: 400 });
    }

    const tokenHash = hashOpaqueToken(token);
    const enrollment = await prisma.enrollmentToken.findUnique({
      where: { tokenHash },
      include: { developer: true },
    });

    if (!enrollment) {
      return NextResponse.json({ error: "invalid token" }, { status: 401 });
    }

    if (enrollment.usedAt) {
      return NextResponse.json({ error: "token already used" }, { status: 401 });
    }

    if (enrollment.expiresAt < new Date()) {
      return NextResponse.json({ error: "token expired" }, { status: 401 });
    }

    if (!enrollment.developer) {
      return NextResponse.json(
        { error: "legacy unbound token is not supported; generate a new token" },
        { status: 401 },
      );
    }

    const orgId = enrollment.orgId;

    const enrollmentCheck = await commercialFeatures.assertCanEnrollDevice(orgId);
    if (!enrollmentCheck.allowed) {
      return NextResponse.json({ error: enrollmentCheck.message }, { status: 403 });
    }

    const deviceToken = generateDeviceToken();
    const device = await prisma
      .$transaction(async (tx) => {
        const consumed = await tx.enrollmentToken.updateMany({
          where: { id: enrollment.id, usedAt: null, expiresAt: { gt: new Date() } },
          data: { usedAt: new Date() },
        });
        if (consumed.count !== 1) throw new Error("TOKEN_CONSUMED");
        return tx.device.create({
          data: {
            orgId,
            userId: enrollment.developer!.id,
            hostname: String(hostname || "unknown").slice(0, 255),
            os: String(os || "unknown").slice(0, 64),
            architecture: String(architecture || "unknown").slice(0, 64),
            agentVersion: String(agentVersion || "0.1.0").slice(0, 64),
            deviceTokenHash: hashOpaqueToken(deviceToken),
            status: "online",
          },
        });
      })
      .catch((error) => {
        if (error instanceof Error && error.message === "TOKEN_CONSUMED") return null;
        throw error;
      });
    if (!device) return NextResponse.json({ error: "token already used" }, { status: 401 });

    const appUrl = getPublicAppUrl();
    const telemetryEndpoint = await prisma.telemetryEndpoint.findUnique({
      where: { orgId },
      select: { enabled: true },
    });

    return NextResponse.json({
      deviceId: device.id,
      userId: enrollment.developer.id,
      orgId,
      deviceToken,
      gatewayUrl: process.env.NEXT_PUBLIC_LITELLM_URL || "http://localhost:4000",
      status: "connected",
      otel: {
        enabled: telemetryEndpoint?.enabled ?? true,
        metricsEndpoint: `${appUrl}/api/otel/v1/metrics`,
      },
    });
  } catch (e) {
    console.error("[enroll]", e);
    return NextResponse.json({ error: "enrollment failed" }, { status: 500 });
  }
}
