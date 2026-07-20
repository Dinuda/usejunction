import { NextRequest, NextResponse } from "next/server";
import { findDeviceByBearerToken } from "@/lib/auth";
import { isAgentCompatibleForWorkExtraction } from "@/lib/agent-updates/contracts";
import { deviceWorkExtractionStartedAt } from "@/lib/signals/collection-window";
import { getEffectiveSignalsPolicy } from "@/lib/signals/service";
import { logServerError } from "@/lib/errors/public";

export async function GET(req: NextRequest) {
  try {
    const device = await findDeviceByBearerToken(req, {
      include: { user: { select: { teamId: true } } },
    });
    if (!device) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const policy = await getEffectiveSignalsPolicy(device.orgId, device.user.teamId);
    const collectionStartedAt = policy.workExtractionEnabled
      ? deviceWorkExtractionStartedAt(policy.workExtractionStartedAt, device.createdAt)
      : null;
    const compatible = isAgentCompatibleForWorkExtraction(device.agentVersion);
    return NextResponse.json({
      policy: {
        ...policy,
        workExtractionEnabled: Boolean(policy.workExtractionEnabled && compatible && collectionStartedAt),
        workExtractionStartedAt: collectionStartedAt?.toISOString() ?? null,
      },
    });
  } catch (e) {
    logServerError("devices/signals-policy", e);
    return NextResponse.json({ error: "signals policy failed" }, { status: 500 });
  }
}
