import { NextRequest, NextResponse } from "next/server";
import { activitySettingsInputSchema } from "@/lib/activity/contracts";
import { getOrgActivitySettings, upsertOrgActivitySettings } from "@/lib/activity/service";
import { audit, requireOrgRole, rolesFor } from "@/lib/rbac";

export async function GET(req: NextRequest) {
  const auth = await requireOrgRole(req, rolesFor("settings_billing"));
  if (auth instanceof NextResponse) return auth;
  const settings = await getOrgActivitySettings(auth.orgId);
  return NextResponse.json({ settings });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireOrgRole(req, rolesFor("settings_billing"));
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => ({}));
  const parsed = activitySettingsInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid activity settings", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const settings = await upsertOrgActivitySettings(auth.orgId, {
    ...parsed.data,
    updatedByUserId: auth.userId,
  });

  await audit({
    orgId: auth.orgId,
    actorType: "user",
    actorId: auth.userId,
    action: "activity_settings.updated",
    targetType: "activity_settings",
    targetId: auth.orgId,
    metadata: {
      teamPeriodControlsEnabled: settings.teamPeriodControlsEnabled,
      teamDeviceActivityEnabled: settings.teamDeviceActivityEnabled,
    },
  });

  return NextResponse.json({ settings });
}
