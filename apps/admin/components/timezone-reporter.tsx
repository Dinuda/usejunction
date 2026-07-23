"use client";

import { useEffect } from "react";

/**
 * Once per authenticated workspace session, report the browser IANA timezone
 * so daily reports can send at 19:00 local. Deferred so it does not compete
 * with page-data fetches on startup.
 */
export function TimezoneReporter() {
  useEffect(() => {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!timeZone) return;
    const key = `uj.tz.reported:${timeZone}`;
    if (typeof sessionStorage !== "undefined" && sessionStorage.getItem(key)) return;

    const report = () => {
      void fetch("/api/app/me/timezone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timeZone, source: "browser" }),
      })
        .then((res) => {
          if (res.ok && typeof sessionStorage !== "undefined") {
            sessionStorage.setItem(key, "1");
          }
        })
        .catch(() => undefined);
    };

    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      const id = window.requestIdleCallback(report, { timeout: 3_000 });
      return () => window.cancelIdleCallback(id);
    }
    const timeout = setTimeout(report, 1_500);
    return () => clearTimeout(timeout);
  }, []);

  return null;
}
