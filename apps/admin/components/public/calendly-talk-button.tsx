"use client";

import { useCallback, useEffect, useState } from "react";
import Script from "next/script";
import { siteConfig } from "@/lib/public/config";
import { cn } from "@/lib/utils";

declare global {
  interface Window {
    Calendly?: {
      initPopupWidget: (options: { url: string }) => void;
    };
  }
}

const CALENDLY_CSS = "https://assets.calendly.com/assets/external/widget.css";
const CALENDLY_JS = "https://assets.calendly.com/assets/external/widget.js";

type CalendlyTalkButtonProps = {
  label: string;
  className?: string;
};

export function CalendlyTalkButton({ label, className }: CalendlyTalkButtonProps) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (document.querySelector(`link[href="${CALENDLY_CSS}"]`)) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = CALENDLY_CSS;
    document.head.appendChild(link);
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined" && window.Calendly) {
      setReady(true);
    }
  }, []);

  const openPopup = useCallback(() => {
    const url = siteConfig.calendlyUrl;
    if (!url) {
      window.location.href = "/contact?intent=enterprise";
      return;
    }
    if (window.Calendly) {
      window.Calendly.initPopupWidget({ url });
      return;
    }
    // Script still loading — open the scheduling page directly.
    window.open(url, "_blank", "noopener,noreferrer");
  }, []);

  return (
    <>
      <Script src={CALENDLY_JS} strategy="lazyOnload" onLoad={() => setReady(true)} />
      <button
        type="button"
        onClick={openPopup}
        className={cn("public-btn w-full rounded-none font-semibold", className)}
        aria-haspopup="dialog"
        data-calendly-ready={ready ? "true" : "false"}
      >
        {label}
      </button>
    </>
  );
}
