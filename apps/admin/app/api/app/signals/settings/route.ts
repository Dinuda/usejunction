import { NextRequest, NextResponse } from "next/server";
import { requireAppPrincipal } from "@/lib/api/app-auth";
import { appData } from "@/lib/api/app-response";
import { getOrgSignalsPolicy } from "@/lib/signals/service";

export async function GET(request: NextRequest) {
  const principal = await requireAppPrincipal(request, ["owner", "admin"]);
  if (principal instanceof NextResponse) return principal;
  return appData({ policy: await getOrgSignalsPolicy(principal.orgId) });
}
