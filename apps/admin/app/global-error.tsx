"use client";

import { useEffect } from "react";
import { DM_Sans, Figtree, JetBrains_Mono } from "next/font/google";
import { SystemRouteScreen } from "@/components/system-route-screen";
import "./globals.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
});

const figtree = Figtree({
  subsets: ["latin"],
  variable: "--font-figtree",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
});

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body className={`${dmSans.variable} ${figtree.variable} ${jetbrainsMono.variable}`}>
        <SystemRouteScreen
          title="Something went wrong."
          description="UseJunction couldn’t recover from this error."
          detail={
            error.digest
              ? `Try again. If it keeps happening, share reference ${error.digest} with support.`
              : "Try again, or return home while we get things back on track."
          }
          statement="Visibility before control."
          primary={{ label: "Try again", onClick: reset }}
          secondary={{ label: "Go to home", href: "/" }}
        />
      </body>
    </html>
  );
}
