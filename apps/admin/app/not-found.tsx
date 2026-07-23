import type { Metadata } from "next";
import { SystemRouteScreen } from "@/components/system-route-screen";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <SystemRouteScreen
      title="This page isn’t here."
      description="The link may be outdated, mistyped, or the page moved."
      detail="Use one of the paths below to get back to UseJunction."
      statement="Visibility before control."
      primary={{ label: "Go to home", href: "/" }}
      secondary={{ label: "Open dashboard", href: "/dashboard" }}
    />
  );
}
