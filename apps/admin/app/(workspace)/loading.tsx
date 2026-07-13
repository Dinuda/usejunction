import { AppSidebar, PageHeader } from "@/components/app-shell";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";

function SkeletonBlock({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-muted ${className ?? ""}`} />;
}

export default function WorkspaceLoading() {
  return (
    <SidebarProvider>
      <AppSidebar active="/dashboard" role="admin" />
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center border-b bg-background/95 px-4 sm:px-6 lg:px-8">
          <SidebarTrigger className="mr-3 size-9 rounded-lg border bg-background" />
          <div className="flex-1" />
          <SkeletonBlock className="h-9 w-9 rounded-full" />
        </header>
        <div className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-[1440px]">
          <PageHeader title="Loading workspace" description="Fetching the latest organisation data." />
          <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <SkeletonBlock key={index} className="h-24" />
            ))}
          </div>
          <SkeletonBlock className="mb-4 h-10 w-48" />
          <SkeletonBlock className="h-64 w-full" />
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
