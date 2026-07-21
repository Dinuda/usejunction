"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { AppApiError } from "@/lib/api/client";

export function AppPageSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading page">
      <div className="mb-8 space-y-3 border-b pb-6">
        <Skeleton className="h-9 w-64 max-w-full" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-24" />)}
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

export function AppPageError({ error, retry }: { error: AppApiError; retry: () => void }) {
  const router = useRouter();

  useEffect(() => {
    if (error.code === "WORKSPACE_REQUIRED") {
      router.replace("/onboarding");
    }
  }, [error.code, router]);

  if (error.code === "WORKSPACE_REQUIRED") {
    return <AppPageSkeleton />;
  }

  return (
    <Alert variant="destructive">
      <AlertDescription className="flex flex-wrap items-center gap-3">
        <span className="flex-1">
          {error.status === 401 ? "Your session has expired. Sign in again." : error.message}
        </span>
        {error.status === 401 ? (
          <Button asChild size="sm" variant="outline"><a href="/login">Sign in</a></Button>
        ) : (
          <Button size="sm" variant="outline" onClick={retry}>Retry</Button>
        )}
      </AlertDescription>
    </Alert>
  );
}
