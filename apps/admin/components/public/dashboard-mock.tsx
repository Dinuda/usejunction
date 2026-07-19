"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { MobileDataCard, MobileDataField, MobileDataList } from "@/components/ui/mobile-data";
import { formatUsd } from "@/lib/format";
import { ClaudeCode, Cursor, GithubCopilot, Ollama } from "@/lib/tool-icons";

const VIEW_CYCLE_MS = 7000;
const TICK_INTERVAL_MS = 3000;

type ViewMode = "tool" | "model";

const TOOL_COLUMNS = [
  { label: "Cursor", Icon: Cursor },
  { label: "Claude Code", Icon: ClaudeCode },
  { label: "Copilot", Icon: GithubCopilot },
  { label: "Ollama", Icon: Ollama },
] as const;

type ToolRow = {
  developer: string;
  team: string;
  values: string[];
  alert?: string;
};

type ModelRow = {
  model: string;
  provider: string;
  requests: number;
  cost: number;
  latencyMs: number;
  errorRate: number;
};

const TOOL_ROWS: ToolRow[] = [
  { developer: "sarah@acme.dev", team: "Platform", values: ["$48.20", "1.2M tok", "890ms", "—"] },
  { developer: "alex@acme.dev", team: "Backend", values: ["$36.10", "840K tok", "1.1s", "—"] },
  {
    developer: "morgan@acme.dev",
    team: "Infra",
    values: ["$29.80", "620K tok", "1.4s", "—"],
    alert: "personal key detected",
  },
  { developer: "jordan@acme.dev", team: "Mobile", values: ["$18.40", "410K tok", "760ms", "2 models"] },
  { developer: "taylor@acme.dev", team: "Data", values: ["$12.10", "280K tok", "2.1s", "running"] },
];

const MODEL_ROWS: ModelRow[] = [
  { model: "claude-sonnet-4", provider: "Anthropic", requests: 4821, cost: 112.38, latencyMs: 1100, errorRate: 0.4 },
  { model: "gpt-4o", provider: "OpenAI", requests: 3913, cost: 98.18, latencyMs: 890, errorRate: 0.6 },
  { model: "cursor-small", provider: "Cursor", requests: 2164, cost: 41.94, latencyMs: 757, errorRate: 0.3 },
  { model: "llama3.1:70b", provider: "Ollama", requests: 876, cost: 9.88, latencyMs: 2100, errorRate: 1.2 },
];

const STATS = [
  { label: "Requests / 24h", value: "12,847" },
  { label: "Est. cost", value: "$284.50" },
  { label: "Avg latency", value: "1.2s" },
  { label: "Error rate", value: "0.8%" },
];

function formatRequests(n: number) {
  return n.toLocaleString("en-US");
}

function formatLatency(ms: number) {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

function formatError(rate: number) {
  return `${rate.toFixed(1)}%`;
}

function AnimatedValue({ value }: { value: string }) {
  const reduceMotion = useReducedMotion();

  return (
    <span className="relative inline-block min-w-[3ch] tabular-nums">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={value}
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={reduceMotion ? undefined : { opacity: 0 }}
          transition={{ duration: 0.16, ease: "easeOut" }}
          className="inline-block"
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

function WarningBadge({ label }: { label: string }) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.span
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2, delay: 0.25 }}
      className="mt-1.5 inline-flex items-center gap-1 border px-1.5 py-0.5 text-[10px] public-mono uppercase tracking-wider"
      style={{
        borderColor: "var(--public-warning-border)",
        color: "var(--public-warning)",
        background: "var(--public-warning-bg)",
      }}
    >
      <span className="inline-block h-1 w-1" style={{ background: "var(--public-warning)" }} aria-hidden />
      {label}
    </motion.span>
  );
}

function ViewTabs({
  view,
  onChange,
}: {
  view: ViewMode;
  onChange: (view: ViewMode) => void;
}) {
  return (
    <div className="flex items-center" role="tablist" aria-label="Overview grouping">
      {(
        [
          { id: "tool" as const, label: "By tool" },
          { id: "model" as const, label: "By model" },
        ] as const
      ).map((tab, i) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={view === tab.id}
          onClick={() => onChange(tab.id)}
          className="relative px-3 py-1.5 text-[11px] public-mono uppercase tracking-wider transition-colors"
          style={{
            color: view === tab.id ? "var(--public-fg)" : "var(--public-muted)",
          }}
        >
          {tab.label}
          {view === tab.id && (
            <span
              className="absolute inset-x-0 -bottom-px h-px"
              style={{ background: "var(--public-fg)" }}
              aria-hidden
            />
          )}
          {i === 0 && (
            <span
              className="absolute right-0 top-1/2 h-3 w-px -translate-y-1/2"
              style={{ background: "var(--public-border)" }}
              aria-hidden
            />
          )}
        </button>
      ))}
    </div>
  );
}

function ToolView({ rows }: { rows: ToolRow[] }) {
  return (
    <>
      <MobileDataList className="gap-0 p-3">
        {rows.slice(0, 4).map((row) => (
          <MobileDataCard key={row.developer} className="border-b-0 p-3 last:border-b">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{row.developer}</p>
                <p className="mt-0.5 text-xs text-[var(--public-muted)]">{row.team}</p>
              </div>
              <span className="public-mono shrink-0 text-xs font-medium">{row.values[0]}</span>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-3">
              <MobileDataField label="Tokens" value={row.values[1]} />
              <MobileDataField label="Latency" value={row.values[2]} />
            </dl>
            {row.alert ? <WarningBadge label={row.alert} /> : null}
          </MobileDataCard>
        ))}
      </MobileDataList>
      <table className="hidden w-full table-fixed text-sm md:table">
      <colgroup>
        <col className="w-[34%]" />
        <col className="w-[16.5%]" />
        <col className="w-[16.5%]" />
        <col className="w-[16.5%]" />
        <col className="w-[16.5%]" />
      </colgroup>
      <thead>
        <tr
          className="border-b text-left text-[10px] public-mono uppercase tracking-wider"
          style={{ borderColor: "var(--public-border)", color: "var(--public-muted)" }}
        >
          <th className="px-4 py-2.5 font-medium">Developer</th>
          {TOOL_COLUMNS.map((col) => (
            <th key={col.label} className="px-4 py-2.5 text-right font-medium">
              <span className="inline-flex items-center justify-end gap-1.5 normal-case tracking-normal text-[12px]">
                <col.Icon size={15} />
                <span>{col.label}</span>
              </span>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.developer} className="border-b" style={{ borderColor: "var(--public-border)" }}>
            <td className="px-4 py-3">
              <div className="text-[14px] font-medium">{row.developer}</div>
              <div className="mt-0.5 text-[12px] text-[var(--public-muted)]">{row.team}</div>
              {row.alert && <WarningBadge label={row.alert} />}
            </td>
            {row.values.map((val, i) => (
              <td key={i} className="px-4 py-3 text-right public-mono text-[12px] text-[var(--public-muted)]">
                <AnimatedValue value={val} />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
      </table>
    </>
  );
}

function ModelView({ rows }: { rows: ModelRow[] }) {
  return (
    <>
      <MobileDataList className="gap-0 p-3">
        {rows.map((row) => (
          <MobileDataCard key={row.model} className="border-b-0 p-3 last:border-b">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-mono text-sm font-medium">{row.model}</p>
                <p className="mt-0.5 text-xs text-[var(--public-muted)]">{row.provider}</p>
              </div>
              <span className="public-mono shrink-0 text-xs font-medium">{formatUsd(row.cost)}</span>
            </div>
            <dl className="mt-3 grid grid-cols-3 gap-2">
              <MobileDataField label="Requests" value={formatRequests(row.requests)} />
              <MobileDataField label="Latency" value={formatLatency(row.latencyMs)} />
              <MobileDataField label="Errors" value={formatError(row.errorRate)} />
            </dl>
          </MobileDataCard>
        ))}
      </MobileDataList>
      <table className="hidden w-full table-fixed text-sm md:table">
      <colgroup>
        <col className="w-[30%]" />
        <col className="w-[18%]" />
        <col className="w-[17%]" />
        <col className="w-[17%]" />
        <col className="w-[18%]" />
      </colgroup>
      <thead>
        <tr
          className="border-b text-left text-[10px] public-mono uppercase tracking-wider"
          style={{ borderColor: "var(--public-border)", color: "var(--public-muted)" }}
        >
          <th className="px-4 py-2.5 font-medium">Model</th>
          <th className="px-4 py-2.5 font-medium">Provider</th>
          <th className="px-4 py-2.5 text-right font-medium">Requests</th>
          <th className="px-4 py-2.5 text-right font-medium">Cost</th>
          <th className="px-4 py-2.5 text-right font-medium">Latency</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.model} className="border-b" style={{ borderColor: "var(--public-border)" }}>
            <td className="px-4 py-3">
              <div className="text-[14px] font-medium public-mono">{row.model}</div>
              <div className="mt-0.5 text-[12px] text-[var(--public-muted)]">
                {formatError(row.errorRate)} err
              </div>
            </td>
            <td className="px-4 py-3 text-[12px] text-[var(--public-muted)]">{row.provider}</td>
            <td className="px-4 py-3 text-right public-mono text-[12px] text-[var(--public-muted)]">
              <AnimatedValue value={formatRequests(row.requests)} />
            </td>
            <td className="px-4 py-3 text-right public-mono text-[12px] text-[var(--public-muted)]">
              <AnimatedValue value={formatUsd(row.cost)} />
            </td>
            <td className="px-4 py-3 text-right public-mono text-[12px] text-[var(--public-muted)]">
              <AnimatedValue value={formatLatency(row.latencyMs)} />
            </td>
          </tr>
        ))}
      </tbody>
      </table>
    </>
  );
}

export function DashboardMock() {
  const [view, setView] = useState<ViewMode>("model");
  const [toolRows, setToolRows] = useState(TOOL_ROWS);
  const [modelRows, setModelRows] = useState(MODEL_ROWS);
  const [tick, setTick] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduceMotion = useReducedMotion();

  const cycleView = useCallback(() => {
    setView((current) => (current === "tool" ? "model" : "tool"));
  }, []);

  const handleViewChange = useCallback((next: ViewMode) => {
    setPaused(true);
    setView(next);
    window.setTimeout(() => setPaused(false), VIEW_CYCLE_MS);
  }, []);

  useEffect(() => {
    if (reduceMotion || paused) return;
    const interval = window.setInterval(cycleView, VIEW_CYCLE_MS);
    return () => window.clearInterval(interval);
  }, [cycleView, paused, reduceMotion]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setTick((t) => t + 1);

      setToolRows((prev) => {
        const eligible = prev
          .map((row, index) => ({ row, index }))
          .filter(({ row }) => !row.alert && !row.values.some((v) => v === "running" || v.includes("model")));
        if (eligible.length === 0) return prev;

        const target = eligible[Math.floor(Math.random() * eligible.length)];
        const metricIndex = Math.floor(Math.random() * 3);

        return prev.map((row, index) => {
          if (index !== target.index) return row;
          const values = [...row.values];
          const current = values[metricIndex];
          if (!current || current === "—") return row;

          if (metricIndex === 0) {
            const cost = parseFloat(current.replace(/[$,]/g, "")) + (Math.random() - 0.5) * 0.8;
            values[metricIndex] = `$${Math.max(0, cost).toFixed(2)}`;
          } else if (metricIndex === 1) {
            const isM = current.includes("M");
            const num = parseFloat(current) * (isM ? 1_000_000 : 1_000) + Math.floor(Math.random() * 700);
            values[metricIndex] = isM
              ? `${(num / 1_000_000).toFixed(1)}M tok`
              : `${Math.round(num / 1_000)}K tok`;
          } else {
            const ms = parseInt(current.replace(/[^\d]/g, ""), 10) + Math.floor((Math.random() - 0.5) * 18);
            values[metricIndex] = ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.max(200, ms)}ms`;
          }

          return { ...row, values };
        });
      });

      setModelRows((prev) => {
        const index = Math.floor(Math.random() * prev.length);
        const metric = Math.floor(Math.random() * 3);

        return prev.map((row, i) => {
          if (i !== index) return row;
          if (metric === 0) {
            return { ...row, requests: Math.max(0, row.requests + Math.floor((Math.random() - 0.45) * 22)) };
          }
          if (metric === 1) {
            return { ...row, cost: Math.max(0, row.cost + (Math.random() - 0.45) * 0.5) };
          }
          return {
            ...row,
            latencyMs: Math.max(200, row.latencyMs + Math.floor((Math.random() - 0.5) * 20)),
          };
        });
      });
    }, TICK_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, []);

  return (
    <div
      className="flex min-h-[40rem] w-full flex-col md:min-h-[26.5rem]"
      style={{ background: "var(--public-surface)" }}
    >
      <div
        className="flex min-h-10 flex-wrap items-center justify-between gap-2 border-b px-3 py-2 sm:h-10 sm:flex-nowrap sm:gap-3 sm:px-4 sm:py-0"
        style={{ borderColor: "var(--public-border)", background: "var(--public-surface)" }}
      >
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-[12px] font-medium tracking-tight">Overview</span>
          <span className="text-[var(--public-border)]">/</span>
          <span className="text-[11px] public-mono text-[var(--public-muted)]">last 24h</span>
        </div>
        <div className="flex shrink-0 items-center gap-1 sm:gap-3">
          <ViewTabs view={view} onChange={handleViewChange} />
          <div className="flex items-center gap-1.5 text-[10px] public-mono text-[var(--public-muted)]">
            <span
              className="inline-block h-1.5 w-1.5"
              style={{ background: "var(--public-accent)" }}
              aria-hidden
            />
            <span>live</span>
            <span className="text-[var(--public-border)]">·</span>
            <span className="tabular-nums">{tick}</span>
          </div>
        </div>
      </div>

      <div
        className="grid grid-cols-2 gap-px border-b sm:grid-cols-4"
        style={{ background: "var(--public-border)" }}
      >
        {STATS.map((stat) => (
          <div key={stat.label} className="px-4 py-3" style={{ background: "var(--public-surface)" }}>
            <div className="text-[11px] public-mono uppercase tracking-wider text-[var(--public-muted)]">
              {stat.label}
            </div>
            <div className="mt-1.5 text-[17px] font-semibold public-mono tabular-nums">
              {stat.value}
            </div>
          </div>
        ))}
      </div>

      <div className="relative min-h-[18rem] flex-1 overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={view}
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="absolute inset-0 overflow-x-hidden overflow-y-auto overscroll-contain"
          >
            {view === "tool" ? <ToolView rows={toolRows} /> : <ModelView rows={modelRows} />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
