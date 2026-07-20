import { NextRequest, NextResponse } from "next/server";
import { agentUpdateEventSchema, recordAgentUpdateEvent } from "@/lib/agent-updates";
import { findDeviceByBearerToken } from "@/lib/auth";
import { limitedJson } from "@/lib/security/http";
import { logServerError } from "@/lib/errors/public";

export async function POST(req: NextRequest) {
  const device = await findDeviceByBearerToken(req, {
    select: { id: true, orgId: true, os: true, architecture: true, agentVersion: true },
  });
  if (!device) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsedBody = await limitedJson(req, 128 * 1024);
  if (!parsedBody.ok) return parsedBody.response;
  const parsed = agentUpdateEventSchema.safeParse(parsedBody.data);
  if (!parsed.success) return NextResponse.json({ error: "invalid update event" }, { status: 400 });
  try {
    const deployment = await recordAgentUpdateEvent(device, parsed.data);
    return NextResponse.json({ ok: true, state: deployment.state, confirmedAt: deployment.confirmedAt?.toISOString() ?? null });
  } catch (error) {
    if (error instanceof Error && error.message === "UPDATE_ATTEMPT_NOT_FOUND") {
      return NextResponse.json({ error: "update attempt not found" }, { status: 404 });
    }
    logServerError("devices/agent-update", error);
    return NextResponse.json({ error: "update event failed" }, { status: 500 });
  }
}
