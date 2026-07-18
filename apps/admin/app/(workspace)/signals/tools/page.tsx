import { redirect } from "next/navigation";

/** Classic journey tool adoption is hidden for the work-first Signals ship. */
export default function SignalsToolsPage() {
  redirect("/signals/activity");
}
