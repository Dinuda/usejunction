"use client";

import { useEffect } from "react";
import { SystemRouteScreen } from "@/components/system-route-screen";

export default function ErrorPage({
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
    <SystemRouteScreen
      title="Something went wrong."
      description="We hit an unexpected error while loading this page."
      detail={
        error.digest
          ? `You can try again. If it keeps happening, share reference ${error.digest} with support.`
          : "You can try again, or head somewhere familiar while we sort it out."
      }
      statement="Visibility before control."
      primary={{ label: "Try again", onClick: reset }}
      secondary={{ label: "Go to home", href: "/" }}
    />
  );
}
