import { DM_Sans, JetBrains_Mono } from "next/font/google";
import { cookies } from "next/headers";
import { MarketingTopNav } from "@/components/public/marketing-top-nav";
import { COOKIE_NAME, verifySessionToken } from "@/lib/session-edge";
import "../public-theme.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
});

async function getIsAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return false;
  const email = await verifySessionToken(token);
  return !!email;
}

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const isAuthenticated = await getIsAuthenticated();

  return (
    <div className={`public-root ${dmSans.variable} ${jetbrainsMono.variable}`}>
      <MarketingTopNav isAuthenticated={isAuthenticated} />
      {children}
    </div>
  );
}
