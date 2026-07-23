import MemberWorkClientScreen from "@/components/developers/member-work-client-screen";
import { MemberPageShell } from "@/components/developers/member-page-shell";

export default async function MemberWorkPage({
  params,
  searchParams,
}: {
  params: Promise<{ developerId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { developerId } = await params;
  const search = await searchParams;
  return (
    <MemberPageShell developerId={developerId} section="work" searchParams={search}>
      <MemberWorkClientScreen />
    </MemberPageShell>
  );
}
