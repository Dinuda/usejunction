/** Safe same-origin path for post-auth navigation. */
export function safeAuthNextPath(raw: string | null | undefined, fallback = "/dashboard") {
  if (!raw) return fallback;
  const path = raw.trim();
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("://") || path.includes("\\")) {
    return fallback;
  }
  return path;
}
