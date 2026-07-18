import { redirect } from "next/navigation";

/** Classic journey detail is hidden for the work-first Signals ship. */
export default function SignalsJourneyDetailPage() {
  redirect("/signals/activity");
}
