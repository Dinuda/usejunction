import { auth } from "@/auth";
import { prisma } from "@usejunction/db";
import { AuthShell } from "@/components/auth/auth-shell";
import { InviteAuthActions } from "@/app/join/[token]/invite-auth-actions";
import { CompanyJoinButton } from "./company-join-button";

export default async function CompanyJoinPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await auth();
  const organization = await prisma.organization.findUnique({ where: { slug } });
  const available = Boolean(organization?.companyJoinEnabled);

  if (!organization || !available) {
    return (
      <AuthShell
        size="md"
        accent="cyan"
        contentAlign="top"
        eyebrow="Join"
        title="Company join is unavailable."
        description="Ask your administrator for an email invitation or a verified company link."
        statement="Visibility before control."
      >
        <p className="text-sm leading-6 text-muted-foreground">
          This workspace is not accepting company joins right now.
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      size="md"
      accent="cyan"
      contentAlign="top"
      eyebrow="Join"
      title={`Join ${organization.name}.`}
      description="Use your verified company account to join this workspace."
      statement="Visibility before control."
    >
      {session?.user?.id ? <CompanyJoinButton slug={slug} /> : <InviteAuthActions token={`company/${slug}`} />}
    </AuthShell>
  );
}
