import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;

  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const litellmUrl = process.env.LITELLM_URL || "http://localhost:4000";
    const litellmKey = process.env.LITELLM_MASTER_KEY;

    if (!litellmKey) {
      return NextResponse.json({ ok: true, skipped: "LITELLM_MASTER_KEY not set" });
    }

    const res = await fetch(`${litellmUrl}/budget/reset`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${litellmKey}`,
        "content-type": "application/json",
      },
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("[cron/litellm-budget] reset failed:", res.status, text);
      return NextResponse.json({ ok: false, status: res.status }, { status: 502 });
    }

    return NextResponse.json({ ok: true, resetAt: new Date().toISOString() });
  } catch (e) {
    console.error("[cron/litellm-budget]", e);
    return NextResponse.json({ error: "cron failed" }, { status: 500 });
  }
}
