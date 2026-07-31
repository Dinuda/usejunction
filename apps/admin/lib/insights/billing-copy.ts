import { formatUsd } from "@/lib/format";

/** Copy that distinguishes monthly billing dollars from live quota windows. */
export function estimatedUsageLabel() {
  return "Estimated usage";
}

export function estimatedUsageWindowTooltip(usageWindowLabel: string, reportWindowLabel: string) {
  const label = usageWindowLabel.trim().toLowerCase();
  const reportWindow = reportWindowLabel.trim();
  if (label === "mixed usage windows") {
    return `${estimatedUsageLabel()} covers ${reportWindow}. This row combines multiple quota windows, so quota resets and pace are separate from the dollar estimate.`;
  }
  if (label.startsWith("awaiting ")) {
    return `${estimatedUsageLabel()} covers ${reportWindow}. The configured quota window is not available from the provider yet, so pace is separate from the dollar estimate.`;
  }
  return `${estimatedUsageLabel()} covers ${reportWindow}. The quota meter uses the ${label} usage window and resets separately.`;
}

export function billingSeatLabel(cycleSpend: number) {
  return `Seat ${formatUsd(cycleSpend)}/mo`;
}
