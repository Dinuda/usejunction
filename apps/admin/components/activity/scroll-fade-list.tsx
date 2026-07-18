"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type ScrollFadeListProps = {
  children: ReactNode;
  className?: string;
  /** Max height of the scroll region. Defaults to max-h-80. */
  maxHeightClassName?: string;
  /** Optional count label shown when the list does not overflow. */
  countLabel?: string | null;
};

export function ScrollFadeList({
  children,
  className,
  maxHeightClassName = "max-h-80",
  countLabel,
}: ScrollFadeListProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [canScroll, setCanScroll] = useState(false);

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setCanScroll(el.scrollHeight > el.clientHeight + 1);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    return () => observer.disconnect();
  }, [update, children]);

  return (
    <div className={cn(className)}>
      <div
        ref={ref}
        className={cn(
          "uj-scrollbar overflow-y-auto overscroll-contain border border-border/70 bg-card",
          maxHeightClassName,
        )}
      >
        {children}
      </div>
      {!canScroll && countLabel ? (
        <p className="mt-3 text-xs text-muted-foreground">{countLabel}</p>
      ) : null}
    </div>
  );
}

/** Back-compat wrapper used by Activity metric lists. */
export function ScrollableMetricList({
  children,
  countLabel,
  maxHeightClassName,
}: {
  children: ReactNode;
  countLabel?: string | null;
  maxHeightClassName?: string;
}) {
  return (
    <ScrollFadeList countLabel={countLabel} maxHeightClassName={maxHeightClassName}>
      {children}
    </ScrollFadeList>
  );
}
