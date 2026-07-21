"use client";

import { MemberClientLayout } from "@/components/developers/member-client-layout";

export default function MemberLayout({ children }: { children: React.ReactNode }) {
  return <MemberClientLayout>{children}</MemberClientLayout>;
}
