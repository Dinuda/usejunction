import { DM_Sans, JetBrains_Mono } from "next/font/google";
import { cookies } from "next/headers";
import { MarketingTopNav } from "@/components/public/marketing-top-nav";
import "../public-theme.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
});
export default async function PublicLayout({ children }: { children: React.ReactNode }) {

  return (
    <div className={`public-root ${dmSans.variable} ${jetbrainsMono.variable}`}>
      <MarketingTopNav isAuthenticated={false} />
      {children}
    </div>
  );
}
