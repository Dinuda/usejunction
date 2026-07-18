/**
 * Prefer API error text when it looks intentional; otherwise use the fallback.
 * Never surface raw HTTP dumps, JSON bodies, or stack-like messages in the UI.
 */
export function userFacingError(apiError: string | null | undefined, fallback: string) {
  if (!apiError?.trim()) return fallback;
  if (
    /returned \d{3}|stack trace|at [\w.$]+\(|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|\{"error"|Prisma|TypeError:|ReferenceError:/i.test(
      apiError,
    )
  ) {
    return fallback;
  }
  return apiError;
}
