import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@usejunction/db";
import { agentUpdateEventSchema, recordAgentUpdateEvent } from "@/lib/agent-updates";
import { bearerToken } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const token = bearerToken(req);
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const device = await prisma.device.findUnique({
    where: { deviceToken: token },
    select: { id: true, orgId: true, os: true, architecture: true, agentVersion: true },
  });
  if (!device) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = agentUpdateEventSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid update event" }, { status: 400 });
  try {
    const deployment = await recordAgentUpdateEvent(device, parsed.data);
    return NextResponse.json({ ok: true, state: deployment.state, confirmedAt: deployment.confirmedAt?.toISOString() ?? null });
  } catch (error) {
    if (error instanceof Error && error.message === "UPDATE_ATTEMPT_NOT_FOUND") {
      return NextResponse.json({ error: "update attempt not found" }, { status: 404 });
    }
    console.error("[devices/agent-update]", error);
    return NextResponse.json({ error: "update event failed" }, { status: 500 });
  }
}
