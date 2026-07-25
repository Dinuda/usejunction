import MemberCodingClientScreen from "@/components/developers/member-coding-client-screen";
import { MemberPageShell } from "@/components/developers/member-page-shell";

export default function MemberCodingPage() {
  return (
    <MemberPageShell>
      <MemberCodingClientScreen />
    </MemberPageShell>
  );
}
