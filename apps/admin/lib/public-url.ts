/** Public control-plane URL for install/enroll commands (tunnel or production). */
export function getPublicAppUrl() {
  const configured =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    "";
  return configured.replace(/\/$/, "") || "http://localhost:3001";
}
