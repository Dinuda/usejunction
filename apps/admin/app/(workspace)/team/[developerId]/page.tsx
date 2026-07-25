import MemberOverviewClientScreen from "@/components/developers/member-overview-client-screen";
import { MemberPageShell } from "@/components/developers/member-page-shell";

export default function MemberOverviewPage() {
  return (
    <MemberPageShell>
      <MemberOverviewClientScreen />
    </MemberPageShell>
  );
}
