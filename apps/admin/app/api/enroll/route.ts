import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { Prisma, prisma } from "@usejunction/db";
import { assertCanEnrollDevice } from "@/lib/saas-billing/status";
import { generateDeviceToken } from "@/lib/auth";
import { ensureActiveReleaseDeployment, normalizeAgentVersion } from "@/lib/agent-updates";
import { getPublicAppUrl } from "@/lib/public-url";
import { hashOpaqueToken } from "@/lib/security";
import { limitedJson } from "@/lib/security/http";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { logServerError } from "@/lib/errors/public";

export async function POST(req: NextRequest) {
  try {
    const limited = await enforceRateLimit(req, { key: "enroll", limit: 20, windowSeconds: 60 });
    if (limited !== true) return limited;
    const parsedBody = await limitedJson(req, 16 * 1024);
    if (!parsedBody.ok) return parsedBody.response;
    const body = parsedBody.data as Record<string, unknown>;
    const { hostname, os, architecture, agentVersion } = body;
    const token = String(body.token ?? "");

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

    const enrollmentCheck = await assertCanEnrollDevice(orgId, enrollment.developer.id);
    if (!enrollmentCheck.allowed) {
      return NextResponse.json({ error: enrollmentCheck.message }, { status: 403 });
    }

    const deviceToken = generateDeviceToken();
    const deviceTokenHash = hashOpaqueToken(deviceToken);
    let device;
    try {
      device = await prisma.$transaction(async (tx) => {
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
            agentVersion: normalizeAgentVersion(agentVersion, "0.1.0"),
            deviceToken: `rotated:new:${randomUUID()}`,
            deviceTokenHash,
          },
        });
      });
    } catch (error) {
      if (error instanceof Error && error.message === "TOKEN_CONSUMED") {
        return NextResponse.json({ error: "token already used" }, { status: 401 });
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return NextResponse.json({ error: "This user already has a device enrolled." }, { status: 409 });
      }
      throw error;
    }

    await ensureActiveReleaseDeployment({
      id: device.id,
      orgId: device.orgId,
      os: device.os,
      architecture: device.architecture,
      agentVersion: device.agentVersion,
    }).catch((error) => {
      logServerError("enroll/active-release-attach", error);
    });

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
      // Observability-only product: never point agents at a gateway.
      // Legacy clients may still read this field; keep it empty.
      gatewayUrl: "",
      status: "connected",
      otel: {
        enabled: telemetryEndpoint?.enabled ?? true,
        metricsEndpoint: `${appUrl}/api/otel/v1/metrics`,
      },
    });
  } catch (e) {
    logServerError("enroll", e);
    return NextResponse.json({ error: "enrollment failed" }, { status: 500 });
  }
}
