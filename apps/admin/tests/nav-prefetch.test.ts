import { QueryClient } from "@tanstack/react-query";
import { beforeEach, expect, test, vi } from "vitest";
import { teamKey } from "@/lib/app-pages/query-keys";

const mocks = vi.hoisted(() => ({
  appFetch: vi.fn(),
}));

vi.mock("@/lib/api/client", () => ({
  appFetch: mocks.appFetch,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.appFetch.mockResolvedValue({ developers: [] });
});

test("Team navigation prefetch fills the destination screen's canonical query key", async () => {
  const { prefetchNavPage } = await import("@/lib/app-pages/nav-prefetch");
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  prefetchNavPage(queryClient, "/team");
  await queryClient.refetchQueries({ queryKey: teamKey() });

  expect(mocks.appFetch).toHaveBeenCalledWith("/api/app/team");
  expect(queryClient.getQueryData(teamKey())).toEqual({ developers: [] });
});

test("repeated hover events do not start a second request while warming", async () => {
  mocks.appFetch.mockImplementation(() => new Promise(() => {}));
  const { prefetchNavPage } = await import("@/lib/app-pages/nav-prefetch");
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  prefetchNavPage(queryClient, "/team");
  prefetchNavPage(queryClient, "/team");

  expect(mocks.appFetch).toHaveBeenCalledTimes(1);
});

test("fresh destination data skips another warmup request", async () => {
  const { prefetchNavPage } = await import("@/lib/app-pages/nav-prefetch");
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  queryClient.setQueryData(teamKey(), { developers: [] });

  prefetchNavPage(queryClient, "/team");

  expect(mocks.appFetch).not.toHaveBeenCalled();
});
