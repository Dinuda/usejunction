import { COOKIE_NAME, MAX_AGE_SEC, createSessionToken, verifySessionToken } from "./session-edge";

export function verifyAdminCredentials(email: string, password: string): boolean {
  const adminEmail = process.env.ADMIN_EMAIL || "admin@example.com";
  const adminPassword = process.env.ADMIN_PASSWORD || "admin";
  return email === adminEmail && password === adminPassword;
}

export { COOKIE_NAME, MAX_AGE_SEC, createSessionToken, verifySessionToken };
