import { NextRequest, NextResponse } from "next/server";
import { requireAppPrincipal } from "@/lib/api/app-auth";
import { appData } from "@/lib/api/app-response";
import { loadSignalsSettingsPage } from "@/lib/app-pages/signals-settings";

export async function GET(request: NextRequest) {
  const principal = await requireAppPrincipal(request, ["owner", "admin"]);
  if (principal instanceof NextResponse) return principal;
  return appData(await loadSignalsSettingsPage(principal));
}
