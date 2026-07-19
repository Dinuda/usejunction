"use client";

import { motion, useReducedMotion } from "framer-motion";
import { AlertTriangle, ArrowUpRight, Check, Search, Sparkles, TrendingUp } from "lucide-react";
import type { ReactNode } from "react";
import { ClaudeCode, Cursor, GithubCopilot } from "@/lib/tool-icons";

const EASE = [0.22, 1, 0.36, 1] as const;

const chartBars = [32, 39, 36, 48, 44, 56, 51, 66, 61, 72, 68, 82, 76, 91];

function FrameDots() {
  return (
    <div className="flex items-center gap-1.5" aria-hidden>
      <span className="size-1.5 rounded-full bg-[#d8dad3]" />
      <span className="size-1.5 rounded-full bg-[#d8dad3]" />
      <span className="size-1.5 rounded-full bg-[#d8dad3]" />
    </div>
  );
}

function MetricChip({
  className,
  delay,
  children,
}: {
  className: string;
  delay: number;
  children: ReactNode;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, scale: 0.9, y: 10 }}
      animate={reduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: [0, -5, 0] }}
      transition={
        reduceMotion
          ? { duration: 0.25, delay }
          : {
              opacity: { duration: 0.35, delay, ease: EASE },
              scale: { duration: 0.35, delay, ease: EASE },
              y: { duration: 4.8, delay: delay + 0.4, repeat: Infinity, ease: "easeInOut" },
            }
      }
      className={`hero-data-chip absolute z-30 flex items-center gap-2 rounded-xl border border-[#dcddd7] bg-white px-3 py-2 text-[11px] font-medium text-[#262722] ${className}`}
    >
      {children}
    </motion.div>
  );
}

export function HeroProductFrames() {
  const reduceMotion = useReducedMotion();

  return (
    <div
      className="relative mx-auto h-[34rem] w-full max-w-[34rem] sm:h-[38rem] lg:h-[42rem] lg:max-w-[40rem]"
      role="img"
      aria-label="UseJunction AI coding observability briefing with usage, cost, plan utilization, and configuration insights"
    >
      <div
        className="absolute left-[13%] top-[8%] h-[78%] w-[74%] rounded-[2.25rem] bg-[color-mix(in_srgb,var(--primary)_9%,transparent)] blur-3xl"
        aria-hidden
      />

      <MetricChip className="left-[1%] top-[20%] sm:left-[3%]" delay={0.55}>
        <Cursor size={16} />
        <span>Cursor</span>
        <span className="font-mono text-[10px] text-[var(--public-muted)]">$4.2k</span>
      </MetricChip>

      <MetricChip className="right-[1%] top-[13%] hidden sm:flex" delay={0.7}>
        <span className="font-mono text-xs font-semibold text-[var(--primary)]">2.46B</span>
        <span className="text-[var(--public-muted)]">tokens</span>
      </MetricChip>

      <MetricChip className="bottom-[17%] left-[1%] hidden sm:flex" delay={0.85}>
        <GithubCopilot size={16} />
        <span>Copilot</span>
        <span className="font-mono text-[10px] text-[var(--public-muted)]">42 seats</span>
      </MetricChip>

      <MetricChip className="bottom-[8%] right-[1%] sm:right-[3%]" delay={1}>
        <span className="flex size-5 items-center justify-center rounded-md bg-[#edf7f1] text-[#16805d]">
          <Check className="size-3" />
        </span>
        <span>31 / 33 devices healthy</span>
      </MetricChip>

      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 22, rotate: -1.5 }}
        animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: [0, -4, 0], rotate: [-0.4, 0.1, -0.4] }}
        transition={
          reduceMotion
            ? { duration: 0.4 }
            : {
                opacity: { duration: 0.45, delay: 0.2, ease: EASE },
                y: { duration: 6.5, delay: 0.8, repeat: Infinity, ease: "easeInOut" },
                rotate: { duration: 8, delay: 0.8, repeat: Infinity, ease: "easeInOut" },
              }
        }
        className="hero-product-frame absolute left-[7%] top-[16%] z-10 w-[72%] overflow-hidden rounded-2xl border border-[#dfe0da] bg-[#f7f7f3]"
        aria-hidden
      >
        <div className="flex h-10 items-center justify-between border-b border-[#e5e6e0] px-4">
          <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--public-muted)]">
            Workspace overview
          </span>
          <FrameDots />
        </div>
        <div className="space-y-3 p-4 opacity-75 sm:p-5">
          <div className="flex items-center justify-between">
            <div className="h-2 w-24 rounded-full bg-[#dedfd8]" />
            <div className="h-2 w-10 rounded-full bg-[#e7e8e2]" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            {["h-14", "h-14", "h-14"].map((height, index) => (
              <div key={index} className={`${height} rounded-lg border border-[#e0e1db] bg-white`} />
            ))}
          </div>
          <div className="h-24 rounded-lg border border-[#e0e1db] bg-white" />
        </div>
      </motion.div>

      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 28, scale: 0.96 }}
        animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: [0, -7, 0], scale: 1 }}
        transition={
          reduceMotion
            ? { duration: 0.4 }
            : {
                opacity: { duration: 0.5, delay: 0.35, ease: EASE },
                scale: { duration: 0.5, delay: 0.35, ease: EASE },
                y: { duration: 7.5, delay: 1.1, repeat: Infinity, ease: "easeInOut" },
              }
        }
        className="hero-product-frame absolute left-[15%] top-[23%] z-20 w-[76%] overflow-hidden rounded-2xl border border-[#d8dad3] bg-white"
      >
        <div className="flex h-11 items-center justify-between border-b border-[#e6e7e1] px-4">
          <div className="flex items-center gap-2">
            <span className="flex size-6 items-center justify-center rounded-md bg-[var(--primary)] text-white">
              <Sparkles className="size-3.5" />
            </span>
            <span className="text-xs font-semibold tracking-tight">AI coding briefing</span>
          </div>
          <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--public-muted)]">
            Live
          </span>
        </div>

        <div className="p-4 sm:p-5">
          <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--public-muted)]">
            Last 30 days · Engineering
          </p>
          <div className="mt-2 flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] text-[var(--public-muted)]">Estimated AI cost</p>
              <p className="mt-1 text-2xl font-semibold tracking-[-0.04em] sm:text-[1.75rem]">$18,420</p>
            </div>
            <div className="mt-1 flex items-center gap-1 rounded-md bg-[#edf7f1] px-2 py-1 font-mono text-[9px] text-[#16805d]">
              <TrendingUp className="size-3" />
              12.4%
            </div>
          </div>

          <div className="mt-5 flex h-24 items-end gap-1 rounded-xl bg-[#f7f7f3] px-3 pb-3 pt-4 sm:h-28 sm:gap-1.5">
            {chartBars.map((height, index) => (
              <motion.span
                key={index}
                initial={reduceMotion ? false : { height: 4 }}
                animate={{ height: `${height}%` }}
                transition={{ duration: 0.45, delay: 0.65 + index * 0.025, ease: EASE }}
                className="min-w-0 flex-1 rounded-t-sm bg-[var(--primary)]"
                style={{ opacity: 0.35 + index * 0.04 }}
              />
            ))}
          </div>

          <div className="mt-4 grid grid-cols-3 divide-x divide-[#e6e7e1] border-y border-[#e6e7e1] py-3">
            {[
              ["Active developers", "48"],
              ["Requests", "1.8M"],
              ["Savings found", "$2.1k"],
            ].map(([label, value]) => (
              <div key={label} className="px-2 first:pl-0 last:pr-0">
                <p className="truncate text-[8px] text-[var(--public-muted)] sm:text-[9px]">{label}</p>
                <p className="mt-1 font-mono text-xs font-semibold sm:text-sm">{value}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 flex items-start gap-3 rounded-xl border border-[#dfe0da] bg-[#fbfbf8] p-3">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-[#e8f3f5] text-[var(--primary)]">
              <ArrowUpRight className="size-3.5" />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold sm:text-[11px]">Claude Code adoption drove this month&apos;s increase</p>
              <p className="mt-1 text-[9px] leading-relaxed text-[var(--public-muted)]">
                Platform usage rose 18% while cost per active developer fell.
              </p>
            </div>
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 18, x: 12 }}
        animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: [0, 5, 0], x: 0 }}
        transition={
          reduceMotion
            ? { duration: 0.35 }
            : {
                opacity: { duration: 0.4, delay: 0.72, ease: EASE },
                x: { duration: 0.4, delay: 0.72, ease: EASE },
                y: { duration: 5.5, delay: 1.2, repeat: Infinity, ease: "easeInOut" },
              }
        }
        className="hero-product-frame absolute bottom-[8%] right-[3%] z-30 hidden w-[48%] rounded-xl border border-[#dcddd7] bg-white p-3.5 sm:block"
        aria-hidden
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-[#f9eee8] text-[#c0682c]">
              <ClaudeCode size={15} />
            </span>
            <div className="min-w-0">
              <p className="truncate text-[10px] font-semibold">Claude Code plan</p>
              <p className="font-mono text-[8px] text-[var(--public-muted)]">Cycle utilization</p>
            </div>
          </div>
          <span className="font-mono text-sm font-semibold">86%</span>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#ecece7]">
          <motion.div
            initial={reduceMotion ? false : { width: 0 }}
            animate={{ width: "86%" }}
            transition={{ duration: 0.7, delay: 1, ease: EASE }}
            className="h-full rounded-full bg-[#c0682c]"
          />
        </div>
      </motion.div>

      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 12 }}
        animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: [0, -3, 0] }}
        transition={
          reduceMotion
            ? { duration: 0.35 }
            : {
                opacity: { duration: 0.35, delay: 0.9 },
                y: { duration: 4.5, delay: 1.4, repeat: Infinity, ease: "easeInOut" },
              }
        }
        className="hero-product-frame absolute bottom-[20%] left-[1%] z-30 hidden w-[42%] rounded-xl border border-[#ead8b4] bg-[#fffaf0] p-3 sm:block"
        aria-hidden
      >
        <div className="flex items-start gap-2.5">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-[#fef0d4] text-[#b87508]">
            <AlertTriangle className="size-3.5" />
          </span>
          <div>
            <p className="text-[10px] font-semibold">3 personal keys detected</p>
            <p className="mt-1 text-[8px] leading-relaxed text-[#7d6b48]">Review ownership before the next billing cycle.</p>
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 18 }}
        animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: [0, -4, 0] }}
        transition={
          reduceMotion
            ? { duration: 0.35 }
            : {
                opacity: { duration: 0.4, delay: 0.5, ease: EASE },
                y: { duration: 5.8, delay: 1, repeat: Infinity, ease: "easeInOut" },
              }
        }
        className="hero-product-frame absolute left-[8%] top-[8%] z-40 flex w-[84%] items-center gap-3 rounded-2xl border border-[#d8dad3] bg-white p-2.5 pr-3 sm:left-[11%] sm:w-[79%] sm:p-3"
        aria-hidden
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-[#f2f3ee] text-[var(--public-muted)]">
          <Search className="size-4" />
        </span>
        <span className="min-w-0 flex-1 truncate text-[10px] text-[#4e504a] sm:text-xs">
          Where is AI coding usage growing fastest?
        </span>
        <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-[var(--primary)] text-white">
          <Sparkles className="size-3.5" />
        </span>
      </motion.div>
    </div>
  );
}
