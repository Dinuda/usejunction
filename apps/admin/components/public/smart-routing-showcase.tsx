"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, forwardRef } from "react";
import type { ComponentType } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ClaudeCode, GithubCopilot, Ollama, OpenAI } from "@lobehub/icons";
import { cn } from "@/lib/utils";

type IconProps = { size?: number | string; className?: string };
type Point = { x: number; y: number };

type ConnectorPaths = {
  width: number;
  height: number;
  reqToRouter: string;
  routerToModels: string[];
  modelEndpoints: Point[];
};

const CYCLE_MS = 2600;
const PARTICLE_STAGGER_MS = 360;
const PARTICLE_COUNT = 4;

const REQUESTS = [
  { id: "long-context", label: "long-context", modelIndex: 0, badge: "policy" },
  { id: "cheap-batch", label: "cheap batch", modelIndex: 2, badge: "cost" },
  { id: "low-latency", label: "low-latency", modelIndex: 1, badge: "latency" },
] as const;

const MODELS = [
  {
    name: "Claude Sonnet",
    provider: "Anthropic",
    reason: "policy: sensitive",
    metric: "1.1s · $0.012/k",
    Icon: ClaudeCode as ComponentType<IconProps>,
  },
  {
    name: "GPT-4o",
    provider: "OpenAI",
    reason: "latency: fast",
    metric: "0.9s · $0.005/k",
    Icon: OpenAI as ComponentType<IconProps>,
  },
  {
    name: "Ollama",
    provider: "local",
    reason: "cost: $0",
    metric: "self-hosted",
    Icon: Ollama as ComponentType<IconProps>,
  },
  {
    name: "Copilot",
    provider: "GitHub",
    reason: "fallback",
    metric: "2.1s · seat",
    Icon: GithubCopilot as ComponentType<IconProps>,
  },
] as const;

function anchorPoint(
  el: HTMLElement,
  container: DOMRect,
  side: "left" | "right" | "top" | "bottom",
): Point {
  const r = el.getBoundingClientRect();
  switch (side) {
    case "left":
      return { x: r.left - container.left, y: r.top - container.top + r.height / 2 };
    case "right":
      return { x: r.right - container.left, y: r.top - container.top + r.height / 2 };
    case "top":
      return { x: r.left - container.left + r.width / 2, y: r.top - container.top };
    case "bottom":
      return { x: r.left - container.left + r.width / 2, y: r.bottom - container.top };
  }
}

function bezierPath(from: Point, to: Point): string {
  const midX = (from.x + to.x) / 2;
  return `M ${from.x} ${from.y} C ${midX} ${from.y}, ${midX} ${to.y}, ${to.x} ${to.y}`;
}

export function SmartRoutingShowcase() {
  const reduceMotion = useReducedMotion();
  const stageRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef<HTMLDivElement>(null);
  const routerRef = useRef<HTMLDivElement>(null);
  const modelRefs = useRef<(HTMLDivElement | null)[]>([]);

  const [inView, setInView] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [pulseTick, setPulseTick] = useState(0);
  const [paths, setPaths] = useState<ConnectorPaths | null>(null);

  const activeRequest = REQUESTS[activeIndex];
  const activeModelIndex = activeRequest.modelIndex;
  const shouldAnimate = inView && !reduceMotion;

  const measurePaths = useCallback(() => {
    const stage = stageRef.current;
    const request = requestRef.current;
    const router = routerRef.current;
    if (!stage || !request || !router) return;

    const container = stage.getBoundingClientRect();
    const from = anchorPoint(request, container, "right");
    const routerLeft = anchorPoint(router, container, "left");
    const routerRight = anchorPoint(router, container, "right");

    const routerToModels: string[] = [];
    const modelEndpoints: Point[] = [];

    modelRefs.current.forEach((modelEl) => {
      if (!modelEl) return;
      const to = anchorPoint(modelEl, container, "left");
      modelEndpoints.push(to);
      routerToModels.push(bezierPath(routerRight, to));
    });

    setPaths({
      width: container.width,
      height: container.height,
      reqToRouter: bezierPath(from, routerLeft),
      routerToModels,
      modelEndpoints,
    });
  }, []);

  useLayoutEffect(() => {
    measurePaths();
  }, [measurePaths, activeIndex, pulseTick, reduceMotion]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const observer = new ResizeObserver(() => measurePaths());
    observer.observe(stage);
    window.addEventListener("resize", measurePaths);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measurePaths);
    };
  }, [measurePaths]);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), {
      threshold: 0.2,
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!shouldAnimate) return;
    const interval = window.setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % REQUESTS.length);
      setPulseTick((t) => t + 1);
    }, CYCLE_MS);
    return () => window.clearInterval(interval);
  }, [shouldAnimate]);

  const activeModelPath = paths?.routerToModels[activeModelIndex] ?? "";
  const activeModelEndpoint = paths?.modelEndpoints[activeModelIndex];

  return (
    <div className="mt-12">
      <div
        ref={stageRef}
        className="sr-stage relative overflow-hidden border"
        style={{
          borderColor: "var(--public-border)",
          minHeight: "30rem",
        }}
      >
        <div className="sr-grid-bg" aria-hidden />
        <div className="sr-glow" aria-hidden />
        {shouldAnimate && <div className="sr-scanline" aria-hidden />}

        {/* Measured SVG connectors — desktop only */}
        {paths && paths.width > 0 && (
          <svg
            className="pointer-events-none absolute inset-0 z-[5] hidden h-full w-full lg:block"
            width={paths.width}
            height={paths.height}
            aria-hidden
          >
            <path d={paths.reqToRouter} fill="none" stroke="var(--public-border)" strokeWidth="1.5" />

            {paths.routerToModels.map((p, i) => (
              <path
                key={p}
                d={p}
                fill="none"
                stroke="var(--public-border)"
                strokeWidth="1.5"
                opacity={i === activeModelIndex ? 0.5 : 0.2}
                style={{ transition: "opacity 0.4s ease" }}
              />
            ))}

            {shouldAnimate && (
              <>
                <motion.path
                  key={`req-${activeIndex}`}
                  d={paths.reqToRouter}
                  fill="none"
                  stroke="var(--public-accent)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  initial={{ pathLength: 0, opacity: 0.6 }}
                  animate={{ pathLength: 1, opacity: 1 }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                />
                {activeModelPath && (
                  <motion.path
                    key={`model-${activeIndex}`}
                    d={activeModelPath}
                    fill="none"
                    stroke="var(--public-accent)"
                    strokeWidth="2"
                    strokeLinecap="round"
                    initial={{ pathLength: 0, opacity: 0.6 }}
                    animate={{ pathLength: 1, opacity: 1 }}
                    transition={{ duration: 0.5, ease: "easeOut", delay: 0.3 }}
                  />
                )}
              </>
            )}

            {shouldAnimate &&
              activeModelPath &&
              [...Array(PARTICLE_COUNT)].map((_, i) => (
                <g key={`particles-${activeIndex}-${i}`}>
                  <ParticleDot
                    path={paths.reqToRouter}
                    delay={i * PARTICLE_STAGGER_MS}
                    duration={CYCLE_MS * 0.45}
                  />
                  <ParticleDot
                    path={activeModelPath}
                    delay={CYCLE_MS * 0.32 + i * PARTICLE_STAGGER_MS}
                    duration={CYCLE_MS * 0.5}
                  />
                </g>
              ))}

            {activeModelEndpoint && shouldAnimate && (
              <motion.circle
                key={`endpoint-${activeIndex}`}
                cx={activeModelEndpoint.x}
                cy={activeModelEndpoint.y}
                r="4"
                fill="var(--public-accent)"
                initial={{ scale: 0 }}
                animate={{ scale: [0, 1.4, 1] }}
                transition={{ duration: 0.5, delay: 0.55, ease: "easeOut" }}
                style={{ transformBox: "fill-box", transformOrigin: "center" }}
              />
            )}
          </svg>
        )}

        <div className="relative z-10 flex flex-col gap-10 p-6 sm:p-10 lg:grid lg:min-h-[30rem] lg:grid-cols-[1fr_auto_1.25fr] lg:items-center lg:gap-8">
          {/* Requests */}
          <div className="flex flex-col gap-3 lg:justify-center">
            <p className="public-eyebrow mb-2 flex items-center gap-2">
              <span className="inline-block h-1.5 w-1.5" style={{ background: "var(--public-accent)" }} />
              Incoming requests
            </p>
            {reduceMotion ? (
              <div ref={requestRef} className="flex flex-col gap-2">
                {REQUESTS.map((req) => (
                  <RequestChip key={req.id} label={req.label} badge={req.badge} staticMode />
                ))}
              </div>
            ) : (
              <div ref={requestRef} className="relative min-h-[4.5rem]">
                <AnimatePresence mode="wait" onExitComplete={measurePaths}>
                  <motion.div
                    key={activeRequest.id}
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -14, filter: "blur(2px)" }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                    onAnimationComplete={measurePaths}
                  >
                    <RequestChip label={activeRequest.label} badge={activeRequest.badge} active />
                  </motion.div>
                </AnimatePresence>
              </div>
            )}
            <div className="mt-1 flex items-center gap-2 text-xs public-mono text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="inline-block h-2 w-2"
                  style={{
                    background: shouldAnimate ? "var(--public-accent)" : "var(--public-border)",
                  }}
                />
                {shouldAnimate ? "streaming" : "idle"}
              </span>
              <span className="opacity-40">·</span>
              <span>~{Math.round(12000 / (CYCLE_MS / 1000)).toLocaleString()} req/h</span>
            </div>
          </div>

          {/* Router */}
          <div className="flex flex-col items-center gap-4">
            <RouterCore
              ref={routerRef}
              pulseTick={pulseTick}
              shouldAnimate={shouldAnimate}
              onAnimationComplete={measurePaths}
            />
            <MobileConnector />
          </div>

          {/* Models */}
          <div>
            <div className="mb-4 flex items-center justify-between">
              <p className="public-eyebrow flex items-center gap-2">
                <span className="inline-block h-1.5 w-1.5" style={{ background: "var(--public-accent)" }} />
                Routed to
              </p>
              <span className="text-xs public-mono text-muted-foreground">
                {shouldAnimate ? `route #${String(pulseTick + 1).padStart(3, "0")}` : "—"}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-px" style={{ background: "var(--public-border)" }}>
              {MODELS.map((model, i) => {
                const isActive = shouldAnimate && i === activeModelIndex;
                const Icon = model.Icon;
                return (
                  <motion.div
                    key={model.name}
                    ref={(el) => {
                      modelRefs.current[i] = el;
                    }}
                    animate={
                      isActive
                        ? { backgroundColor: "var(--public-bg)" }
                        : { backgroundColor: "var(--public-surface)" }
                    }
                    transition={{ duration: 0.4 }}
                    className="relative flex flex-col gap-3 p-4 sm:p-5"
                    style={{
                      outline: isActive ? "1px solid var(--public-accent)" : undefined,
                      outlineOffset: "-1px",
                    }}
                  >
                    {isActive && (
                      <motion.span
                        layoutId="sr-active-bar"
                        className="absolute left-0 top-0 h-full w-[3px]"
                        style={{ background: "var(--public-accent)" }}
                        transition={{ duration: 0.45, ease: "easeOut" }}
                      />
                    )}
                    <div className="flex items-center gap-3">
                      <motion.div
                        animate={isActive ? { scale: [1, 1.12, 1] } : { scale: 1 }}
                        transition={{ duration: 0.5, delay: 0.45 }}
                        className="flex h-10 w-10 shrink-0 items-center justify-center border"
                        style={{
                          borderColor: isActive ? "var(--public-accent)" : "var(--public-border)",
                          background: "var(--public-surface)",
                        }}
                      >
                        <Icon size={20} />
                      </motion.div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold leading-tight">{model.name}</p>
                        <p className="mt-0.5 text-xs public-mono text-muted-foreground">{model.provider}</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className="text-xs public-mono"
                        style={{ color: isActive ? "var(--public-accent)" : "var(--public-muted)" }}
                      >
                        {model.reason}
                      </span>
                      <span className="text-[0.7rem] public-mono text-muted-foreground opacity-70">
                        {model.metric}
                      </span>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Route requests to the right model based on cost, latency, and policy — when you&apos;re
          ready.
        </p>
        <span className="shrink-0 text-xs public-mono text-muted-foreground">
          Roadmap — not available today
        </span>
      </div>
    </div>
  );
}

const RouterCore = forwardRef<
  HTMLDivElement,
  { pulseTick: number; shouldAnimate: boolean; onAnimationComplete?: () => void }
>(function RouterCore({ pulseTick, shouldAnimate, onAnimationComplete }, ref) {
  return (
    <motion.div
      ref={ref}
      key={pulseTick}
      initial={shouldAnimate ? { scale: 0.96, opacity: 0.85 } : false}
      animate={shouldAnimate ? { scale: [0.96, 1.04, 1], opacity: 1 } : { scale: 1, opacity: 1 }}
      transition={{ duration: 0.55, ease: "easeOut" }}
      onAnimationComplete={onAnimationComplete}
      className="relative w-full max-w-[15rem] border px-6 py-7 text-center lg:w-56"
      style={{
        borderColor: "var(--public-border)",
        background: "var(--public-surface)",
      }}
    >
      <span
        className="sr-core absolute -left-[3px] top-0 h-full w-[3px]"
        style={{ background: "var(--public-accent)" }}
        aria-hidden
      />
      <div className="flex items-center justify-center gap-2">
        <span
          className="inline-flex h-7 w-7 items-center justify-center border"
          style={{
            borderColor: "var(--public-accent)",
            background: "color-mix(in srgb, var(--public-accent) 10%, transparent)",
          }}
        >
          <span className="inline-block h-2 w-2" style={{ background: "var(--public-accent)" }} />
        </span>
        <p className="text-sm font-semibold tracking-tight">UseJunction · router</p>
      </div>
      <p className="mt-3 text-xs public-mono text-muted-foreground">
        routing by cost · latency · policy
      </p>
      <div className="mt-4 flex items-center justify-center gap-1.5">
        {[0, 1, 2, 3].map((i) => (
          <motion.span
            key={i}
            className="inline-block h-1 w-1"
            animate={
              shouldAnimate
                ? { opacity: [0.25, 1, 0.25], background: "var(--public-accent)" }
                : { opacity: 0.25, background: "var(--public-border)" }
            }
            transition={{
              duration: 1.2,
              repeat: Infinity,
              delay: i * 0.15,
              ease: "easeInOut",
            }}
          />
        ))}
      </div>
    </motion.div>
  );
});

function MobileConnector() {
  return (
    <div className="flex flex-col items-center gap-1 lg:hidden" aria-hidden>
      <div className="h-6 w-px" style={{ background: "var(--public-border)" }} />
      <span className="text-xs public-mono text-muted-foreground">↓</span>
      <div className="h-6 w-px" style={{ background: "var(--public-border)" }} />
    </div>
  );
}

function ParticleDot({ path, delay, duration }: { path: string; delay: number; duration: number }) {
  const id = useRef(`sr-p-${Math.random().toString(36).slice(2, 8)}`).current;

  return (
    <circle
      r="2.5"
      fill="var(--public-accent)"
      style={
        {
          offsetPath: `path('${path}')`,
          offsetRotate: "0deg",
          animation: `${id} ${duration}ms linear ${delay}ms infinite`,
        } as React.CSSProperties
      }
    >
      <style>{`@keyframes ${id} {
        0% { offset-distance: 0%; opacity: 0; }
        15% { opacity: 1; }
        85% { opacity: 1; }
        100% { offset-distance: 100%; opacity: 0; }
      }`}</style>
    </circle>
  );
}

function RequestChip({
  label,
  badge,
  active,
  staticMode,
}: {
  label: string;
  badge: string;
  active?: boolean;
  staticMode?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative border px-4 py-3.5 text-sm public-mono transition-colors",
        active && "text-foreground",
        staticMode && "text-muted-foreground",
      )}
      style={{
        borderColor: active ? "var(--public-accent)" : "var(--public-border)",
        background: active
          ? "color-mix(in srgb, var(--public-accent) 6%, var(--public-surface))"
          : "var(--public-surface)",
      }}
    >
      {active && (
        <span
          className="absolute left-0 top-0 h-full w-[3px]"
          style={{ background: "var(--public-accent)" }}
        />
      )}
      <div className="flex items-center justify-between gap-3">
        <span>
          <span className="text-muted-foreground">request · </span>
          {label}
        </span>
        <span
          className="shrink-0 border px-1.5 py-0.5 text-[0.65rem] uppercase tracking-wide"
          style={{
            borderColor: active ? "var(--public-accent)" : "var(--public-border)",
            color: active ? "var(--public-accent)" : "var(--public-muted)",
          }}
        >
          {badge}
        </span>
      </div>
    </div>
  );
}
