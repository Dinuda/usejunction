import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "UseJunction — AI Coding Observability",
  description: "Track usage, cost, latency, and configuration health across AI coding tools.",
  icons: {
    icon: "/favicon.svg",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
