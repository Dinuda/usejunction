import { NextRequest, NextResponse } from "next/server";
import { updateDirectiveForDevice } from "@/lib/agent-updates";
import { findDeviceByBearerToken } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const device = await findDeviceByBearerToken(req, {
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
