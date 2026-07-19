import { validateHttpsUnlessLoopback } from "@/lib/security/env-guard";

/** Public control-plane URL for install/enroll commands (tunnel or production). */
export function getPublicAppUrl() {
  const configured =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    "";
  const value = configured.replace(/\/$/, "") || "http://localhost:3001";
  const problem = validateHttpsUnlessLoopback("public app URL", value);
  if (problem && process.env.NODE_ENV === "production") throw new Error(problem);
  return value;
}
