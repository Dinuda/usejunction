import { NextRequest, NextResponse } from "next/server";
import { getIndexNowKey, submitAllUrls } from "@/lib/public/indexnow";

/**
 * Trigger IndexNow submission of all public URLs.
 * Guarded by the IndexNow key: pass it as ?key=... or x-indexnow-key header.
 * Intended to be called after a production deploy (e.g. from CI).
 */
export async function POST(request: NextRequest) {
  const key = getIndexNowKey();
  if (!key) {
    return NextResponse.json({ error: "IndexNow is not configured." }, { status: 503 });
  }

  const provided = request.nextUrl.searchParams.get("key") ?? request.headers.get("x-indexnow-key");
  if (provided !== key) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const result = await submitAllUrls();
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
