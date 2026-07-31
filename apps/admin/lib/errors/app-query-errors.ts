import { useEffect, useRef } from "react";
import { toast } from "sonner";
import type { AppApiError } from "@/lib/api/client";
import { userFacingError } from "@/lib/errors/user-facing";

export function appQueryErrorMessage(error: AppApiError): string {
  if (error.status === 401) return "Your session has expired. Sign in again.";
  if (/^failed to fetch$/i.test(error.message.trim())) {
    return "Could not reach the server. Check your connection.";
  }
  return userFacingError(error.message, "Unable to load data.");
}

/** Page-blocking when required data never loaded; otherwise surface as a toast. */
export function isBlockingAppQueryError(
  error: AppApiError | null | undefined,
  hasData: boolean,
): error is AppApiError {
  return Boolean(error) && !hasData;
}

type NotifyAppQueryErrorOptions = {
  message?: string;
  retry?: () => void;
};

export function notifyAppQueryError(error: AppApiError, options: NotifyAppQueryErrorOptions = {}) {
  const message = options.message ?? appQueryErrorMessage(error);

  if (error.status === 401) {
    toast.error(message, {
      action: { label: "Sign in", onClick: () => { window.location.href = "/login"; } },
    });
    return;
  }

  if (options.retry) {
    toast.error(message, { action: { label: "Retry", onClick: options.retry } });
    return;
  }

  toast.error(message);
}

type UseAppQueryErrorToastOptions = {
  enabled?: boolean;
  message?: string;
  retry?: () => void;
};

export function useErrorMessageToast(
  message: string | null | undefined,
  options: { enabled?: boolean; retry?: () => void } = {},
) {
  const enabled = options.enabled ?? true;
  const retryRef = useRef(options.retry);
  retryRef.current = options.retry;
  const lastToastKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!message) {
      lastToastKeyRef.current = null;
      return;
    }
    if (!enabled) return;
    if (lastToastKeyRef.current === message) return;
    lastToastKeyRef.current = message;

    if (retryRef.current) {
      toast.error(message, { action: { label: "Retry", onClick: () => retryRef.current?.() } });
      return;
    }
    toast.error(message);
  }, [enabled, message]);
}

export function useAppQueryErrorToast(
  error: AppApiError | null | undefined,
  options: UseAppQueryErrorToastOptions = {},
) {
  const enabled = options.enabled ?? true;
  const retryRef = useRef(options.retry);
  retryRef.current = options.retry;
  const lastToastKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!error) {
      lastToastKeyRef.current = null;
      return;
    }
    if (!enabled) return;

    const toastKey = `${error.code}:${error.status}:${error.message}`;
    if (lastToastKeyRef.current === toastKey) return;
    lastToastKeyRef.current = toastKey;

    notifyAppQueryError(error, {
      message: options.message,
      retry: retryRef.current ? () => retryRef.current?.() : undefined,
    });
  }, [enabled, error, options.message]);
}
