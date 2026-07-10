import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@usejunction/db";
import { bearerToken } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const token = bearerToken(req);
    if (!token) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const device = await prisma.device.findUnique({ where: { deviceToken: token } });
    if (!device) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const accounts = body.accounts;
    if (!Array.isArray(accounts)) {
      return NextResponse.json({ error: "accounts array required" }, { status: 400 });
    }

    let upserted = 0;
    for (const acct of accounts) {
      if (!acct.toolName) continue;

      await prisma.toolAccount.upsert({
        where: { deviceId_toolName: { deviceId: device.id, toolName: acct.toolName } },
        update: {
          email: acct.email ?? null,
          plan: acct.plan ?? null,
          loginMethod: acct.loginMethod ?? "unknown",
          authPresent: acct.authPresent ?? false,
          updatedAt: new Date(),
        },
        create: {
          orgId: device.orgId,
          userId: device.userId,
          deviceId: device.id,
          toolName: acct.toolName,
          email: acct.email ?? null,
          plan: acct.plan ?? null,
          loginMethod: acct.loginMethod ?? "unknown",
          authPresent: acct.authPresent ?? false,
        },
      });
      upserted += 1;
    }

    return NextResponse.json({ upserted });
  } catch (e) {
    console.error("[devices/accounts]", e);
    return NextResponse.json({ error: "accounts upsert failed" }, { status: 500 });
  }
}
