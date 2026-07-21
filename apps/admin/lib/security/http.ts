import { NextRequest, NextResponse } from "next/server";

export async function limitedJson(req: NextRequest, maxBytes: number): Promise<{ ok: true; data: unknown } | { ok: false; response: NextResponse }> {
  const declaredLength = req.headers.get("content-length");
  if (declaredLength && Number(declaredLength) > maxBytes) {
    return { ok: false, response: NextResponse.json({ error: "request body too large" }, { status: 413 }) };
  }

  const reader = req.body?.getReader();
  if (!reader) return { ok: true, data: {} };

  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > maxBytes) {
        return { ok: false, response: NextResponse.json({ error: "request body too large" }, { status: 413 }) };
      }
      chunks.push(value);
    }
  }

  if (total === 0) return { ok: true, data: {} };
  const body = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString("utf8");
  try {
    return { ok: true, data: JSON.parse(body) };
  } catch {
    return { ok: false, response: NextResponse.json({ error: "invalid json" }, { status: 400 }) };
  }
}

export function clientIp(req: Request | NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip")?.trim() ||
    "unknown"
  );
}

/** Reject cross-site cookie-authenticated mutations before business logic. */
export function browserMutationGuard(req: NextRequest, env: NodeJS.ProcessEnv = process.env): NextResponse | null {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return null;
  if (env.NODE_ENV !== "production") return null;

  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const forwardedProto = req.headers.get("x-forwarded-proto") ?? "https";
  const expectedOrigin = host ? `${forwardedProto}://${host}` : null;
  const fetchSite = req.headers.get("sec-fetch-site");
  const requestedWith = req.headers.get("x-requested-with");

  if (!origin || !expectedOrigin || origin !== expectedOrigin) {
    return NextResponse.json({ error: "invalid request origin" }, { status: 403 });
  }
  if (fetchSite !== "same-origin" && requestedWith !== "usejunction-web") {
    return NextResponse.json({ error: "same-origin request header required" }, { status: 403 });
  }
  if (req.body && !req.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return NextResponse.json({ error: "content-type must be application/json" }, { status: 415 });
  }
  return null;
}
