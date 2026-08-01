/** Wall clock for dashboards and reports; pinned in Playwright via E2E_AS_OF. */
export function reportNow(): Date {
  const pinned = process.env.E2E_AS_OF?.trim();
  return pinned ? new Date(pinned) : new Date();
}
