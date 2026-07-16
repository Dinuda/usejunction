import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@usejunction/db";
import { updateDirectiveForDevice } from "@/lib/agent-updates";
import { bearerToken } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const token = bearerToken(req);
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const device = await prisma.device.findUnique({
    where: { deviceToken: token },
    select: { id: true, orgId: true, os: true, architecture: true, agentVersion: true },
  });
  if (!device) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const update = await updateDirectiveForDevice(device, { bypassEligibility: true });
    return NextResponse.json({ ok: true, update });
  } catch (error) {
    console.error("[devices/agent-update/check]", error);
    return NextResponse.json({ error: "update check failed" }, { status: 500 });
  }
}
