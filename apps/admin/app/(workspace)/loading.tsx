import { Skeleton } from "@/components/ui/skeleton";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarProvider,
} from "@/components/ui/sidebar";

export default function WorkspaceLoading() {
  return (
    <SidebarProvider defaultOpen>
      <Sidebar collapsible="none" variant="sidebar" className="border-r">
        <SidebarHeader className="border-b p-4">
          <Skeleton className="h-8 w-32" />
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {Array.from({ length: 4 }).map((_, index) => (
                  <SidebarMenuItem key={index}>
                    <SidebarMenuSkeleton />
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur-sm sm:px-6 lg:px-8">
          <div className="min-w-0 flex-1">
            <Skeleton className="h-9 w-48" />
          </div>
          <Skeleton className="size-9 rounded-full" />
        </header>
        <div className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-[1440px]">
            <div className="mb-8 flex flex-col gap-4 border-b pb-6">
              <Skeleton className="h-9 w-64" />
              <Skeleton className="h-4 w-96 max-w-full" />
            </div>
            <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-24" />
              ))}
            </div>
            <Skeleton className="mb-4 h-10 w-48" />
            <Skeleton className="h-64 w-full" />
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
