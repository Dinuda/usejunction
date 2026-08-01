"use client";

import { useCallback } from "react";
import { useQuery, useQueryClient, type QueryKey, type UseQueryOptions } from "@tanstack/react-query";
import type { AppApiFailure, AppApiSuccess } from "@/lib/api/app-response";

export class AppApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AppApiError";
  }
}

function isAbortError(error: unknown): boolean {
  return (
    (typeof DOMException !== "undefined" && error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

/**
 * React Query aborts in-flight fetches on invalidate/refetch. That AbortError is
 * expected; never-settling keeps Next.js/Turbopack from painting it as a runtime overlay.
 */
function swallowAbort(): Promise<never> {
  return new Promise(() => {});
}

export async function appFetch<T>(url: string, signal?: AbortSignal): Promise<T> {
  try {
    const response = await fetch(url, {
      signal,
      credentials: "same-origin",
      cache: "no-store",
      headers: { accept: "application/json", "x-requested-with": "usejunction-web" },
    });
    const body = (await response.json().catch(() => null)) as AppApiSuccess<T> | AppApiFailure | null;
    if (!response.ok || !body || !("data" in body)) {
      const failure = body && "error" in body ? body.error : null;
      throw new AppApiError(response.status, failure?.code ?? "REQUEST_FAILED", failure?.message ?? "Unable to load data.");
    }
    return body.data;
  } catch (error) {
    if (signal?.aborted || isAbortError(error)) return swallowAbort();
    throw error;
  }
}

export async function rawFetch<T>(url: string, signal?: AbortSignal): Promise<T> {
  try {
    const response = await fetch(url, { signal, credentials: "same-origin", cache: "no-store", headers: { accept: "application/json" } });
    const body = await response.json().catch(() => null) as T | { error?: string } | null;
    if (!response.ok || !body) {
      throw new AppApiError(response.status, "REQUEST_FAILED", body && typeof body === "object" && "error" in body && typeof body.error === "string" ? body.error : "Unable to load data.");
    }
    return body as T;
  } catch (error) {
    if (signal?.aborted || isAbortError(error)) return swallowAbort();
    throw error;
  }
}

/** Request init for cookie-authenticated browser mutations (production browserMutationGuard). */
export function browserMutationInit(method: string, body?: unknown): RequestInit {
  return {
    method,
    credentials: "same-origin",
    headers: {
      "content-type": "application/json",
      "x-requested-with": "usejunction-web",
    },
    body: body === undefined ? "{}" : JSON.stringify(body),
  };
}

export async function activateWorkspace(orgId: string): Promise<void> {
  const response = await fetch("/api/me/workspace", browserMutationInit("POST", { orgId }));
  const body = await response.json().catch(() => null) as { error?: string; orgId?: string } | null;
  if (!response.ok || body?.orgId !== orgId) {
    throw new AppApiError(
      response.status,
      "WORKSPACE_ACTIVATION_FAILED",
      body?.error ?? "Could not activate workspace.",
    );
  }
}

export function useRawQuery<T>(queryKey: QueryKey, url: string, options: Omit<UseQueryOptions<T, AppApiError>, "queryKey" | "queryFn"> = {}) {
  return useQuery<T, AppApiError>({ queryKey, queryFn: ({ signal }) => rawFetch<T>(url, signal), ...options });
}

export function useAppQuery<T>(
  queryKey: QueryKey,
  url: string,
  options: Omit<UseQueryOptions<T, AppApiError>, "queryKey" | "queryFn"> = {},
) {
  return useQuery<T, AppApiError>({
    queryKey,
    queryFn: ({ signal }) => appFetch<T>(url, signal),
    ...options,
  });
}

/** Page data queries keep the previous payload visible while filters change. */
export function useAppPageQuery<T>(
  queryKey: QueryKey,
  url: string,
  options: Omit<UseQueryOptions<T, AppApiError>, "queryKey" | "queryFn" | "placeholderData"> = {},
) {
  return useAppQuery<T>(queryKey, url, {
    placeholderData: (previousData) => previousData,
    ...options,
  });
}

/** Refetch every active private page model after a successful browser mutation. */
export function useInvalidateAppData() {
  const queryClient = useQueryClient();
  return useCallback(
    () => queryClient.invalidateQueries({ queryKey: ["app"] }),
    [queryClient],
  );
}
