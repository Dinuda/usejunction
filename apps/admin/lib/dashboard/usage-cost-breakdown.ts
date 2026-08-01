import { formatUsd } from "@/lib/format";

/** KPI sub-line under Estimated usage — omits $0 verified / estimated-only noise. */
export function usageCostBreakdownSub(verified: number, estimated: number): string | undefined {
  if (verified > 0 && estimated > 0) {
    return `${formatUsd(verified)} verified · ${formatUsd(estimated)} estimated`;
  }
  if (verified > 0) return `${formatUsd(verified)} verified`;
  if (estimated > 0) return undefined;
  return undefined;
}
