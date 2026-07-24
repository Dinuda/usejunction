"use client";

import { useParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { AuthShell } from "@/components/auth/auth-shell";
import { useRawQuery } from "@/lib/api/client";
import { InviteAuthActions } from "@/app/join/[token]/invite-auth-actions";
import { CompanyJoinButton } from "./company-join-button";

type Company = { name: string; available: boolean };
type Session = { user?: { id?: string } };

export default function CompanyJoinPage() {
  const { slug } = useParams<{ slug: string }>();
  const company = useRawQuery<Company>(["public", "company-join", slug], `/api/organizations/${encodeURIComponent(slug)}/join`);
  const session = useRawQuery<Session>(["auth", "session"], "/api/auth/session");
  if (company.isPending || session.isPending) {
    return (
      <AuthShell
        size="md"
        accent="cyan"
        contentAlign="top"
        title="Join workspace."
        description="Loading your invite…"
        statement="Visibility before control."
      >
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin text-primary" />
          Checking your invite…
        </div>
      </AuthShell>
    );
  }
  if (company.error || !company.data?.available) return <AuthShell size="md" accent="cyan" contentAlign="top" title="Company join is unavailable." description="Ask your administrator for an email invitation or a verified company link." statement="Visibility before control."><p className="text-sm leading-6 text-muted-foreground">This workspace is not accepting company joins right now.</p></AuthShell>;
  return <AuthShell size="md" accent="cyan" contentAlign="top" title={`Join ${company.data.name}.`} description="Use your verified company account to join this workspace." statement="Visibility before control.">{session.data?.user?.id ? <CompanyJoinButton slug={slug} /> : <InviteAuthActions token={`company/${slug}`} />}</AuthShell>;
}
