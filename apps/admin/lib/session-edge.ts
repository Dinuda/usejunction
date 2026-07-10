const MAX_AGE = 60 * 60 * 24 * 7; // 7 days

function secret(): string {
  return process.env.NEXTAUTH_SECRET || "change-me-in-production";
}

async function sign(payload: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function createSessionToken(email: string): Promise<string> {
  const exp = Date.now() + MAX_AGE * 1000;
  const payload = `${email}:${exp}`;
  const signature = await sign(payload);
  return encodeURIComponent(`${payload}:${signature}`);
}

export async function verifySessionToken(token: string): Promise<string | null> {
  try {
    const decoded = decodeURIComponent(token);
    const lastColon = decoded.lastIndexOf(":");
    if (lastColon === -1) return null;
    const sig = decoded.slice(lastColon + 1);
    const payload = decoded.slice(0, lastColon);
    const expected = await sign(payload);
    if (sig !== expected) return null;
    const colonIdx = payload.indexOf(":");
    if (colonIdx === -1) return null;
    const email = payload.slice(0, colonIdx);
    const exp = parseInt(payload.slice(colonIdx + 1), 10);
    if (!email || isNaN(exp) || Date.now() > exp) return null;
    return email;
  } catch {
    return null;
  }
}

export const COOKIE_NAME = "uj_session";
export const MAX_AGE_SEC = MAX_AGE;
