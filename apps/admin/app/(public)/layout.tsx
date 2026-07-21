"use client";

import { MarketingTopNav } from "@/components/public/marketing-top-nav";
export default function PublicLayout({ children }: { children: React.ReactNode }) {

  return (
    <div>
      <MarketingTopNav isAuthenticated={false} />
      {children}
    </div>
  );
}
