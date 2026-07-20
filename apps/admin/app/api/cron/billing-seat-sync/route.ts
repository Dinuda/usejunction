import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@usejunction/db";
import { syncTeamSeatQuantity } from "@/lib/saas-billing/quantity";
import { logServerError } from "@/lib/errors/public";

function authorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret && process.env.NODE_ENV === "production") {
    return { ok: false as const, response: NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 }) };
  }
  if (
    process.env.NODE_ENV === "production" &&
    secret === "development-cron" &&
    process.env.USEJUNCTION_ALLOW_INSECURE_DEVELOPMENT !== "true"
  ) {
    return { ok: false as const, response: NextResponse.json({ error: "a non-default CRON_SECRET is required" }, { status: 503 }) };
  }
  if (req.headers.get("authorization") !== `Bearer ${secret || "development-cron"}`) {
    return { ok: false as const, response: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  }
  return { ok: true as const };
}

/** Repair active Team subscriptions whose Lemon quantity differs from the roster. */
export async function POST(req: NextRequest) {
  const auth = authorized(req);
  if (!auth.ok) return auth.response;

  const organizations = await prisma.organization.findMany({
    where: {
      plan: "team",
      subscriptionStatus: { in: ["active", "on_trial"] },
      lemonSqueezySubscriptionId: { not: null },
    },
    select: { id: true },
  });

  const results = [];
  for (const organization of organizations) {
    try {
      results.push({
        orgId: organization.id,
        ok: true,
        result: await syncTeamSeatQuantity(organization.id, { verifyRemote: true }),
      });
    } catch (error) {
      logServerError("cron/billing-seat-sync", error, { orgId: organization.id });
      results.push({ orgId: organization.id, ok: false, error: "sync failed" });
    }
  }

  return NextResponse.json({ checked: organizations.length, results });
}
