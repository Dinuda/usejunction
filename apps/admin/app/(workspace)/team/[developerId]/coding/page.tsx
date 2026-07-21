"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { useMemberClientData } from "@/components/developers/member-client-layout";

const AiCodingPanel = dynamic(() => import("@/components/dashboard/ai-coding-panel").then((mod) => mod.AiCodingPanel), { ssr: false });

export default function MemberCodingPage() {
  const searchParams = useSearchParams();
  const { developerId, personal, selectedPeriodLabel } = useMemberClientData();
  const queryString = searchParams.toString();

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
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href={`/team/${developerId}${queryString ? `?${queryString}` : ""}`}>Overview</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>AI coding</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>

      <AiCodingPanel
        metrics={personal.aiCoding30d}
        models={personal.modelUsage30d}
        embedded
      />
    </section>
  );
}
