import type { ReactNode } from "react";
import { MemberClientLayout } from "@/components/developers/member-client-layout";

/** Thin shell — member hub data loads client-side via MemberClientLayout. */
export function MemberPageShell({ children }: { children: ReactNode }) {
  return <MemberClientLayout>{children}</MemberClientLayout>;
}
