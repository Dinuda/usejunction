import { redirect } from "next/navigation";

/** Classic journeys are hidden for the work-first Signals ship. */
export default function SignalsJourneysPage() {
  redirect("/signals/activity");
}
