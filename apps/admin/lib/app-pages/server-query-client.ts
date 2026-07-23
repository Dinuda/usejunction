import { QueryClient } from "@tanstack/react-query";

/** Match client defaults in `app-providers.tsx` so hydrated data is not immediately stale. */
export function makeServerQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 2 * 60 * 1000,
        gcTime: 10 * 60 * 1000,
        retry: 1,
      },
    },
  });
}
