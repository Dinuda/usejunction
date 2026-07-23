import MemberFleetClientScreen from "@/components/developers/member-fleet-client-screen";
import { MemberPageShell } from "@/components/developers/member-page-shell";

export default async function MemberFleetPage({
  params,
  searchParams,
}: {
  params: Promise<{ developerId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { developerId } = await params;
  const search = await searchParams;
  return (
    <MemberPageShell developerId={developerId} section="fleet" searchParams={search}>
      <MemberFleetClientScreen />
    </MemberPageShell>
  );
}
