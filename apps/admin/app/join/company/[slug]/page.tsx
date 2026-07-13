import { auth } from "@/auth";
import { prisma } from "@usejunction/db";
import { AuthFrame } from "@/components/auth/auth-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InviteAuthActions } from "../../[token]/invite-auth-actions";
import { CompanyJoinButton } from "./company-join-button";

export default async function CompanyJoinPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await auth();
  const organization = await prisma.organization.findUnique({ where: { slug }, select: { name: true, domains: { where: { verifiedAt: { not: null } }, select: { domain: true } } } });
  const available = organization && organization.domains.length > 0;
  return <AuthFrame title={available ? `Join ${organization.name}` : "Company join is unavailable"} description={available ? "Use your verified company account to join this workspace." : "This workspace is not accepting company joins right now."}><Card className="shadow-none"><CardHeader className="border-b p-5"><CardTitle className="text-base font-medium">{available ? "Verify your account" : "Ask your administrator"}</CardTitle></CardHeader><CardContent className="space-y-5 p-5">{available ? <>{session?.user?.id ? <CompanyJoinButton slug={slug} /> : <InviteAuthActions token={`company/${slug}`} />}</> : <p className="text-sm leading-6 text-muted-foreground">Ask your administrator for an email invitation or a verified company link.</p>}</CardContent></Card></AuthFrame>;
}
