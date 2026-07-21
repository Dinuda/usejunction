"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AppPageSkeleton } from "@/components/app-data-state";

export function ClientRedirect({ href }: { href: string }) {
  const router = useRouter();
  useEffect(() => router.replace(href), [href, router]);
  return <AppPageSkeleton />;
}
