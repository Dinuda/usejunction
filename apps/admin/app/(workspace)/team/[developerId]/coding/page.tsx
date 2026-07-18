import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { AiCodingPanel } from "@/components/dashboard/ai-coding-panel";
import { loadMemberMetrics, memberPeriodQuery } from "@/lib/developers/member-page-context";

export default async function MemberCodingPage({
  params,
  searchParams,
}: {
  params: Promise<{ developerId: string }>;
  searchParams: Promise<{ view?: string; days?: string; from?: string; to?: string }>;
}) {
  const { developerId } = await params;
  const paramsValue = await searchParams;
  const { personal, selectedPeriodLabel } = await loadMemberMetrics(developerId, paramsValue);

  return (
    <section>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">AI coding.</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Acceptance, commits, tokens, and every model for {selectedPeriodLabel}. Prompt text is
            never collected.
          </p>
        </div>
        <Link
          href={`/team/${developerId}${memberPeriodQuery(paramsValue)}`}
          className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          Back to overview
          <ArrowUpRight className="size-3" />
        </Link>
      </div>

      <AiCodingPanel
        metrics={personal.aiCoding30d}
        models={personal.modelUsage30d}
        embedded
      />
    </section>
  );
}
