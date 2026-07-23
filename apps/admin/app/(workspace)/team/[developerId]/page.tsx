import MemberOverviewClientScreen from "@/components/developers/member-overview-client-screen";
import { MemberPageShell } from "@/components/developers/member-page-shell";

export default async function MemberOverviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ developerId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { developerId } = await params;
  const search = await searchParams;
  return (
    <MemberPageShell developerId={developerId} section="overview" searchParams={search}>
      <MemberOverviewClientScreen />
    </MemberPageShell>
  );
}
