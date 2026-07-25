import MemberFleetClientScreen from "@/components/developers/member-fleet-client-screen";
import { MemberPageShell } from "@/components/developers/member-page-shell";

export default function MemberFleetPage() {
  return (
    <MemberPageShell>
      <MemberFleetClientScreen />
    </MemberPageShell>
  );
}
