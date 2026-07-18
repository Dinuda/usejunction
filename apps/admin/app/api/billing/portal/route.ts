import { NextResponse } from "next/server";
import { prisma } from "@usejunction/db";
import { getCustomerPortalUrl } from "@/lib/saas-billing/lemonsqueezy";
import { publicErrorResponse } from "@/lib/errors/public";
import { audit, rolesFor } from "@/lib/rbac";
import { requireWorkspaceRole } from "@/lib/workspace-context";

export async function POST() {
  const ctx = await requireWorkspaceRole(rolesFor("settings_billing"));

  const org = await prisma.organization.findUnique({
    where: { id: ctx.orgId },
    select: { lemonSqueezyCustomerId: true },
  });

  if (!org?.lemonSqueezyCustomerId) {
    return NextResponse.json({ error: "no billing account found" }, { status: 404 });
  }

  try {
    const url = await getCustomerPortalUrl(org.lemonSqueezyCustomerId);

    await audit({
      orgId: ctx.orgId,
      actorType: "user",
      actorId: ctx.userId,
      action: "billing.portal_opened",
      targetType: "organization",
      targetId: ctx.orgId,
    });

    return NextResponse.json({ url });
  } catch (error) {
    return publicErrorResponse("billing/portal", error, "Billing portal unavailable.", 500);
  }
}
