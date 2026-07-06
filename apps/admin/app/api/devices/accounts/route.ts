import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@usejunction/db";

async function getDevice(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  return prisma.device.findUnique({ where: { deviceToken: auth.slice(7) } });
}

export async function POST(req: NextRequest) {
  const device = await getDevice(req);
  if (!device) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { accounts } = await req.json();
  if (!Array.isArray(accounts)) {
    return NextResponse.json({ error: "accounts array required" }, { status: 400 });
  }

  for (const a of accounts) {
    await prisma.toolAccount.upsert({
      where: { deviceId_toolName: { deviceId: device.id, toolName: a.toolName } },
      create: {
        orgId: device.orgId,
        userId: device.userId,
        deviceId: device.id,
        toolName: a.toolName,
        email: a.email,
        plan: a.plan,
        loginMethod: a.loginMethod || "unknown",
        authPresent: a.authPresent ?? false,
      },
      update: {
        email: a.email,
        plan: a.plan,
        loginMethod: a.loginMethod || "unknown",
        authPresent: a.authPresent ?? false,
        updatedAt: new Date(),
      },
    });
  }

  return NextResponse.json({ ok: true });
}
