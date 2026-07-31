import { auth } from "@/auth";
import { MarketingTopNav } from "@/components/public/marketing-top-nav";

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  return (
    <div>
      <MarketingTopNav isAuthenticated={Boolean(session?.user?.id)} />
      {children}
    </div>
  );
}
