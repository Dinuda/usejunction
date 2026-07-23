import type { ReactNode } from "react";
import { dehydrate, HydrationBoundary, type QueryClient } from "@tanstack/react-query";

export function AppQueryHydration({
  client,
  children,
}: {
  client: QueryClient;
  children: ReactNode;
}) {
  return <HydrationBoundary state={dehydrate(client)}>{children}</HydrationBoundary>;
}
