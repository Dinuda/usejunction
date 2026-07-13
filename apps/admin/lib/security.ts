import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "crypto";

function integrationKey(): Buffer {
  const configured = process.env.INTEGRATION_ENCRYPTION_KEY;
  if (configured) {
    const decoded = Buffer.from(configured, "base64");
    if (decoded.length !== 32) throw new Error("INTEGRATION_ENCRYPTION_KEY must be a base64-encoded 32-byte key");
    return decoded;
  }
  if (process.env.NODE_ENV === "production") throw new Error("INTEGRATION_ENCRYPTION_KEY is required in production");
  return createHash("sha256").update(process.env.AUTH_SECRET || "usejunction-development-only").digest();
}

export function encryptSecret(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", integrationKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptSecret(value: string): string {
  const [version, iv, tag, ciphertext] = value.split(".");
  if (version !== "v1" || !iv || !tag || !ciphertext) throw new Error("invalid encrypted credential");
  const decipher = createDecipheriv("aes-256-gcm", integrationKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
}

export function hashOpaqueToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function credentialFingerprint(secret: string): string {
  return createHash("sha256").update(secret).digest("hex").slice(0, 12);
}

export function constantTimeHashMatch(token: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashOpaqueToken(token), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function generateOpaqueToken(prefix: string, bytes = 32): string {
  return `${prefix}_${randomBytes(bytes).toString("base64url")}`;
}
