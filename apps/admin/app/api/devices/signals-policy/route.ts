import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@usejunction/db";
import { bearerToken } from "@/lib/auth";
import { getEffectiveSignalsPolicy } from "@/lib/signals/service";

export async function GET(req: NextRequest) {
  try {
    const token = bearerToken(req);
    if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const device = await prisma.device.findUnique({
      where: { deviceToken: token },
      include: { user: { select: { teamId: true } } },
    });
    if (!device) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const policy = await getEffectiveSignalsPolicy(device.orgId, device.user.teamId);
    return NextResponse.json({ policy });
  } catch (e) {
    console.error("[devices/signals-policy]", e);
    return NextResponse.json({ error: "signals policy failed" }, { status: 500 });
  }
}
