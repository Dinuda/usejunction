import { NextRequest, NextResponse } from "next/server";
import { requireAppPrincipal } from "@/lib/api/app-auth";
import { appData, appError, timingHeader } from "@/lib/api/app-response";
import { loadToolDetailPage } from "@/lib/app-pages/tool-detail";

export async function GET(request: NextRequest, { params }: { params: Promise<{ toolKey: string }> }) {
  const started = performance.now();
  const principal = await requireAppPrincipal(request, ["owner", "admin"]);
  const authenticated = performance.now();
  if (principal instanceof NextResponse) return principal;

  const rawToolKey = (await params).toolKey;
  const query = request.nextUrl.searchParams;
  const data = await loadToolDetailPage(principal, rawToolKey, {
    view: query.get("view"),
    days: query.get("days"),
    from: query.get("from"),
    to: query.get("to"),
  });
  if (!data) return appError("NOT_FOUND", "Tool not found.", 404);
  const loaded = performance.now();
  return appData(data, {
    serverTiming: timingHeader({
      auth: authenticated - started,
      data: loaded - authenticated,
      total: loaded - started,
    }),
  });
}
