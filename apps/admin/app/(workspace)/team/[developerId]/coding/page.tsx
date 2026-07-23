import MemberCodingClientScreen from "@/components/developers/member-coding-client-screen";
import { MemberPageShell } from "@/components/developers/member-page-shell";

export default async function MemberCodingPage({
  params,
  searchParams,
}: {
  params: Promise<{ developerId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { developerId } = await params;
  const search = await searchParams;
  return (
    <MemberPageShell developerId={developerId} section="coding" searchParams={search}>
      <MemberCodingClientScreen />
    </MemberPageShell>
  );
}
