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
