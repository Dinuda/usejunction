import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@usejunction/db";
import { bearerToken } from "@/lib/auth";
import { syncDetectedPlansForDevice } from "@/lib/tools/sync-detected";

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
    const reported: Array<{ toolName: string; plan: string | null; email: string | null }> = [];
    for (const acct of accounts) {
      if (!acct.toolName) continue;

      const existing = await prisma.toolAccount.findUnique({
        where: { deviceId_toolName: { deviceId: device.id, toolName: acct.toolName } },
        select: { email: true, plan: true },
      });

      const incomingPlan = typeof acct.plan === "string" ? acct.plan.trim() : "";
      const incomingEmail = typeof acct.email === "string" ? acct.email.trim() : "";
      const plan = incomingPlan || existing?.plan || null;
      const email = incomingEmail || existing?.email || null;

      await prisma.toolAccount.upsert({
        where: { deviceId_toolName: { deviceId: device.id, toolName: acct.toolName } },
        update: {
          email,
          plan,
          loginMethod: acct.loginMethod ?? "unknown",
          authPresent: acct.authPresent ?? false,
          updatedAt: new Date(),
        },
        create: {
          orgId: device.orgId,
          userId: device.userId,
          deviceId: device.id,
          toolName: acct.toolName,
          email,
          plan,
          loginMethod: acct.loginMethod ?? "unknown",
          authPresent: acct.authPresent ?? false,
        },
      });
      reported.push({
        toolName: acct.toolName,
        plan,
        email,
      });
      upserted += 1;
    }

    if (reported.length > 0) {
      await prisma.device.update({
        where: { id: device.id },
        data: { lastAccountSyncAt: new Date(), lastSeenAt: new Date(), status: "online" },
      });
      try {
        await syncDetectedPlansForDevice({
          orgId: device.orgId,
          developerId: device.userId,
          accounts: reported,
        });
      } catch (syncError) {
        console.error("[devices/accounts] plan sync failed", syncError);
      }
    }

    return NextResponse.json({ upserted });
  } catch (e) {
    console.error("[devices/accounts]", e);
    return NextResponse.json({ error: "accounts upsert failed" }, { status: 500 });
  }
}
