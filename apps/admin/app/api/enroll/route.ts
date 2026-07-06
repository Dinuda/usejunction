import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@usejunction/db";
import { hashToken, generateDeviceToken, generateEnrollmentToken, verifyIngestAuth, getDefaultOrgId } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { token, email, name, hostname, os, architecture, agentVersion } = body;

    if (!token) {
      return NextResponse.json({ error: "token required" }, { status: 400 });
    }

    const tokenHash = hashToken(token);
    const enrollment = await prisma.enrollmentToken.findUnique({ where: { tokenHash } });

    if (!enrollment || enrollment.expiresAt < new Date()) {
      return NextResponse.json({ error: "invalid or expired token" }, { status: 401 });
    }

    const orgId = enrollment.orgId;
    const userEmail = email || `device-${hostname}@enrolled.local`;
    const userName = name || hostname || "Developer";

    let user = await prisma.user.findUnique({
      where: { orgId_email: { orgId, email: userEmail } },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          orgId,
          teamId: enrollment.teamId,
          name: userName,
          email: userEmail,
          role: "developer",
        },
      });
    }

    const deviceToken = generateDeviceToken();
    const device = await prisma.device.create({
      data: {
        orgId,
        userId: user.id,
        hostname: hostname || "unknown",
        os: os || "unknown",
        architecture: architecture || "unknown",
        agentVersion: agentVersion || "0.1.0",
        deviceToken,
        status: "online",
      },
    });

    await prisma.enrollmentToken.update({
      where: { id: enrollment.id },
      data: { usedAt: new Date() },
    });

    return NextResponse.json({
      deviceId: device.id,
      userId: user.id,
      orgId,
      deviceToken,
      gatewayUrl: process.env.LITELLM_URL || "http://localhost:4000",
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "enrollment failed" }, { status: 500 });
  }
}
