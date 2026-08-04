import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { discoverSourceFiles } from "../src/sources/files.js";
import { readSessionFile, readUsageCache } from "../src/sources/readers.js";
import type { Harness, SessionRecord, UsageRecord } from "../src/types.js";

type ManualLabel = {
  harness: "Codex" | "Cursor" | "Claude Code";
  category: string;
  completion: "complete" | "partial" | "failed" | "non_task";
  oneShot: "yes" | "no" | "unknown";
  verification: "strong" | "moderate" | "none";
};

type RateMetric = { n: number; value: number | null; low: number | null; high: number | null };
type CostMetric = { n: number; value: number | null; low: number | null; high: number | null };

const root = join(dirname(new URL(import.meta.url).pathname), "..");
const manual = JSON.parse(await readFile(join(root, "reports", "manual-gold-set-60d.json"), "utf8")) as {
  window: { from: string; to: string };
  labels: ManualLabel[];
};
const labels = manual.labels;
const harnesses: ManualLabel["harness"][] = ["Codex", "Cursor", "Claude Code"];
const categories = ["feature", "bug fix", "refactor", "testing/debugging", "docs/configuration", "unknown"];

function wilson(successes: number, total: number): [number, number] | null {
  if (!total) return null;
  const z = 1.96;
  const p = successes / total;
  const denominator = 1 + (z * z) / total;
  const center = (p + (z * z) / (2 * total)) / denominator;
  const margin = (z * Math.sqrt((p * (1 - p) / total) + (z * z) / (4 * total * total))) / denominator;
  return [Math.max(0, (center - margin) * 100), Math.min(100, (center + margin) * 100)];
}

function rate(rows: ManualLabel[], kind: "completion" | "oneShot" | "verification" | "failure"): RateMetric {
  const tasks = rows.filter((row) => row.completion !== "non_task");
  const measured = kind === "oneShot" ? tasks.filter((row) => row.oneShot !== "unknown") : tasks;
  const successes = kind === "completion"
    ? measured.filter((row) => row.completion === "complete").length
    : kind === "failure"
      ? measured.filter((row) => row.completion === "failed").length
      : kind === "verification"
        ? measured.filter((row) => row.verification === "strong").length
        : measured.filter((row) => row.oneShot === "yes").length;
  const interval = wilson(successes, measured.length);
  return { n: measured.length, value: measured.length ? (successes / measured.length) * 100 : null, low: interval?.[0] ?? null, high: interval?.[1] ?? null };
}

function quantile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  return lower === upper ? sorted[lower] : sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function costMetric(values: number[]): CostMetric {
  return { n: values.length, value: quantile(values, 0.5), low: quantile(values, 0.25), high: quantile(values, 0.75) };
}

function sessionKey(harness: string, model: string | null, date: string): string {
  return `${harness}|${model ?? "Unknown model"}|${date}`;
}

const manualData = {
  harness: harnesses.map((harness) => ({
    label: harness,
    sub: `${labels.filter((row) => row.harness === harness).length} reviewed sessions`,
    metrics: {
      completion: rate(labels.filter((row) => row.harness === harness), "completion"),
      oneShot: rate(labels.filter((row) => row.harness === harness), "oneShot"),
      verification: rate(labels.filter((row) => row.harness === harness), "verification"),
      failure: rate(labels.filter((row) => row.harness === harness), "failure"),
    },
  })),
  categories: categories.map((category) => ({
    category,
    rows: harnesses.map((harness) => ({
      label: harness,
      sub: `${labels.filter((row) => row.harness === harness && row.category === category).length} reviewed`,
      metrics: {
        completion: rate(labels.filter((row) => row.harness === harness && row.category === category), "completion"),
        oneShot: rate(labels.filter((row) => row.harness === harness && row.category === category), "oneShot"),
        verification: rate(labels.filter((row) => row.harness === harness && row.category === category), "verification"),
        failure: rate(labels.filter((row) => row.harness === harness && row.category === category), "failure"),
      },
    })),
  })),
};

const sourceFiles = await discoverSourceFiles();
const sessions: SessionRecord[] = [];
const usage: UsageRecord[] = [];
for (const source of sourceFiles) {
  if (source.kind === "session") {
    const session = await readSessionFile(source);
    if (session && session.date >= manual.window.from && session.date <= manual.window.to) sessions.push(session);
  } else {
    const records = await readUsageCache(source);
    const cacheHarness: Harness = basename(source.path) === "codex.json"
      ? "Codex"
      : basename(source.path) === "claude.json"
        ? "Claude Code"
        : ["cursor-usage-events.json", "cursor-local.json"].includes(basename(source.path))
          ? "Cursor"
          : "UseJunction";
    usage.push(...records.filter((record) => record.date >= manual.window.from && record.date <= manual.window.to).map((record) => ({ ...record, harness: cacheHarness })));
  }
}

const usageByKey = new Map<string, { cost: number; requests: number }>();
for (const record of usage) {
  if (record.costUsd === null) continue;
  const key = sessionKey(record.harness, record.model, record.date);
  const existing = usageByKey.get(key) ?? { cost: 0, requests: 0 };
  existing.cost += record.costUsd;
  existing.requests += record.requests;
  usageByKey.set(key, existing);
}
const sessionCounts = new Map<string, number>();
for (const session of sessions) sessionCounts.set(sessionKey(session.harness, session.model, session.date), (sessionCounts.get(sessionKey(session.harness, session.model, session.date)) ?? 0) + 1);
const allocatedBySessionKey = new Map<string, number>();
for (const [key, aggregate] of usageByKey) {
  const count = sessionCounts.get(key) ?? 0;
  if (count > 0) allocatedBySessionKey.set(key, aggregate.cost / count);
}

const modelHarnessValues = new Map<string, { harness: Harness; model: string; values: number[] }>();
const categoryValues = new Map<string, { harness: Harness; model: string; category: string; values: number[] }>();
for (const session of sessions) {
  const allocated = allocatedBySessionKey.get(sessionKey(session.harness, session.model, session.date));
  if (allocated === undefined) continue;
  const model = session.model ?? "Unknown model";
  const key = `${session.harness}|${model}`;
  const modelRow = modelHarnessValues.get(key) ?? { harness: session.harness, model, values: [] };
  modelRow.values.push(allocated);
  modelHarnessValues.set(key, modelRow);
  const categoryKey = `${key}|${session.taskCategory}`;
  const categoryRow = categoryValues.get(categoryKey) ?? { harness: session.harness, model, category: session.taskCategory, values: [] };
  categoryRow.values.push(allocated);
  categoryValues.set(categoryKey, categoryRow);
}
const costRows = [...modelHarnessValues.values()]
  .filter((row) => row.values.length >= 2 && row.model !== "Unknown model" && row.values.some((value) => value > 0))
  .map((row) => ({ label: `${row.model} · ${row.harness}`, sub: `${row.values.length} allocated tasks`, metrics: { costPerTask: costMetric(row.values) } }))
  .sort((a, b) => (a.metrics.costPerTask.value ?? Infinity) - (b.metrics.costPerTask.value ?? Infinity));
const costCategoryRows = categories.map((category) => ({
  category,
  rows: [...categoryValues.values()]
    .filter((row) => row.category === category && row.values.length >= 2 && row.model !== "Unknown model" && row.values.some((value) => value > 0))
    .map((row) => ({ label: `${row.model} · ${row.harness}`, sub: `${row.values.length} allocated tasks`, metrics: { costPerTask: costMetric(row.values) } }))
    .sort((a, b) => (a.metrics.costPerTask.value ?? Infinity) - (b.metrics.costPerTask.value ?? Infinity)),
}));
const costMatchCount = [...allocatedBySessionKey.keys()].reduce((sum, key) => sum + (sessionCounts.get(key) ?? 0), 0);
const achievementGroups = new Map<string, { harness: Harness; model: string; category: string; sessions: number; accepted: number; acceptanceMeasured: number; tests: number; testMeasured: number; builds: number; buildMeasured: number }>();
const modelOutcomes = new Map<string, { harness: Harness; model: string; sessions: number; accepted: number; acceptanceMeasured: number; tests: number; testMeasured: number; builds: number; buildMeasured: number }>();
for (const session of sessions) {
  const model = session.model ?? "Unknown model";
  if (model === "Unknown model") continue;
  const groupKey = `${session.harness}|${model}|${session.taskCategory}`;
  const group = achievementGroups.get(groupKey) ?? { harness: session.harness, model, category: session.taskCategory, sessions: 0, accepted: 0, acceptanceMeasured: 0, tests: 0, testMeasured: 0, builds: 0, buildMeasured: 0 };
  group.sessions += 1;
  if (session.acceptance !== "unclear") { group.acceptanceMeasured += 1; if (session.acceptance === "accepted") group.accepted += 1; }
  if (session.testOutcome !== "not_measured") { group.testMeasured += 1; if (session.testOutcome === "passed") group.tests += 1; }
  if (session.buildOutcome !== "not_measured") { group.buildMeasured += 1; if (session.buildOutcome === "passed") group.builds += 1; }
  achievementGroups.set(groupKey, group);
  const modelKey = `${session.harness}|${model}`;
  const modelGroup = modelOutcomes.get(modelKey) ?? { harness: session.harness, model, sessions: 0, accepted: 0, acceptanceMeasured: 0, tests: 0, testMeasured: 0, builds: 0, buildMeasured: 0 };
  modelGroup.sessions += 1;
  if (session.acceptance !== "unclear") { modelGroup.acceptanceMeasured += 1; if (session.acceptance === "accepted") modelGroup.accepted += 1; }
  if (session.testOutcome !== "not_measured") { modelGroup.testMeasured += 1; if (session.testOutcome === "passed") modelGroup.tests += 1; }
  if (session.buildOutcome !== "not_measured") { modelGroup.buildMeasured += 1; if (session.buildOutcome === "passed") modelGroup.builds += 1; }
  modelOutcomes.set(modelKey, modelGroup);
}
const outcomeMetric = (successes: number, measured: number): RateMetric => { const interval = wilson(successes, measured); return { n: measured, value: measured ? (successes / measured) * 100 : null, low: interval?.[0] ?? null, high: interval?.[1] ?? null }; };
const achievementRows = [...achievementGroups.values()]
  .filter((row) => row.sessions >= 2)
  .map((row) => ({ label: `${row.model} · ${row.harness}`, sub: `${row.category} · ${row.sessions} sessions`, metrics: { accepted: outcomeMetric(row.accepted, row.acceptanceMeasured), tests: outcomeMetric(row.tests, row.testMeasured), builds: outcomeMetric(row.builds, row.buildMeasured) } }))
  .sort((a, b) => a.label.localeCompare(b.label));
const usageGroups = new Map<string, { harness: Harness; model: string; tokens: number; requests: number }>();
for (const record of usage) {
  const model = record.model ?? "Unknown model";
  if (model === "Unknown model") continue;
  const key = `${record.harness}|${model}`;
  const group = usageGroups.get(key) ?? { harness: record.harness, model, tokens: 0, requests: 0 };
  group.tokens += (record.inputTokens ?? 0) + (record.outputTokens ?? 0);
  group.requests += record.requests;
  usageGroups.set(key, group);
}
const totalUsageTokens = [...usageGroups.values()].reduce((sum, row) => sum + row.tokens, 0);
const usageRows = [...usageGroups.values()]
  .filter((row) => row.tokens > 0 && totalUsageTokens > 0)
  .map((row) => {
    const outcome = modelOutcomes.get(`${row.harness}|${row.model}`);
    return { key: `${row.harness}|${row.model}`, label: `${row.model} · ${row.harness}`, sub: `${row.requests} usage requests · ${outcome?.sessions ?? 0} task sessions`, usageShare: (row.tokens / totalUsageTokens) * 100, metrics: { accepted: outcomeMetric(outcome?.accepted ?? 0, outcome?.acceptanceMeasured ?? 0), tests: outcomeMetric(outcome?.tests ?? 0, outcome?.testMeasured ?? 0), builds: outcomeMetric(outcome?.builds ?? 0, outcome?.buildMeasured ?? 0) } };
  })
  .sort((a, b) => b.usageShare - a.usageShare);
const modelAchievementRows = [...modelOutcomes.values()]
  .map((row) => ({ label: `${row.model} · ${row.harness}`, sub: `${row.sessions} task sessions`, metrics: { accepted: outcomeMetric(row.accepted, row.acceptanceMeasured), tests: outcomeMetric(row.tests, row.testMeasured), builds: outcomeMetric(row.builds, row.buildMeasured) } }))
  .sort((a, b) => a.label.localeCompare(b.label));
const usageOnlyRows = usageRows.filter((row) => !modelOutcomes.has(row.key));
const efficiencyRows = costRows.map((row) => {
  const usageRow = usageRows.find((candidate) => candidate.label === row.label);
  return usageRow ? { label: row.label, sub: row.sub, cost: row.metrics.costPerTask.value, metrics: usageRow.metrics } : null;
}).filter((row): row is { label: string; sub: string; cost: number | null; metrics: { accepted: RateMetric; tests: RateMetric; builds: RateMetric } } => Boolean(row && row.cost !== null));
const data = JSON.stringify({ ...manualData, costRows, costCategoryRows, costMatchCount, totalSessions: sessions.length, achievementRows, modelAchievementRows, usageRows, usageOnlyRows, efficiencyRows }).replaceAll("</", "<\\/");

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Workflow Benchmark Lab</title><style>
:root{color-scheme:dark;--bg:#0a0b0d;--panel:#111417;--line:#2a3035;--muted:#98a1a8;--text:#f1f3f4;--accent:#d8ff4f;--accent2:#a2e5aa;--warn:#ffcb71;--bad:#ff9292}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:14px/1.45 ui-sans-serif,system-ui,-apple-system,sans-serif}main{max-width:1120px;margin:auto;padding:36px 24px 64px}.eyebrow{color:var(--muted);font-size:12px;font-weight:600;letter-spacing:.12em;text-transform:uppercase}h1{font-size:38px;line-height:1.05;letter-spacing:-.05em;margin:10px 0 8px}.lede{color:var(--muted);max-width:720px;margin:0 0 24px}.leaderboard{border-top:1px solid var(--line)}.controls{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;margin:26px 0 14px}.controls h2{font-size:18px;margin:0}.buttons{display:flex;gap:4px;flex-wrap:wrap}.buttons button{border:1px solid var(--line);background:transparent;color:var(--muted);border-radius:4px;padding:7px 10px;cursor:pointer}.buttons button[aria-pressed=true]{background:var(--accent);border-color:var(--accent);color:#12150b;font-weight:700}.meta{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;color:var(--muted);font-size:12px;margin:8px 0 18px}.axis{display:grid;grid-template-columns:235px 1fr 90px;gap:16px;color:var(--muted);font-size:11px;margin:0 0 6px}.ticks{display:flex;justify-content:space-between}.row{display:grid;grid-template-columns:235px 1fr 90px;gap:16px;align-items:center;min-height:61px;border-bottom:1px solid var(--line)}.label{min-width:0}.label strong{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.label span,.value span{display:block;color:var(--muted);font-size:11px}.track{height:26px;position:relative;background:repeating-linear-gradient(to right,transparent 0,transparent calc(20% - 1px),var(--line) 20%);border-bottom:1px solid var(--line)}.track:before{content:"";position:absolute;inset:0;background:linear-gradient(to right,rgba(216,255,79,.13),transparent);pointer-events:none}.bar{position:absolute;left:0;top:5px;height:17px;background:var(--accent);border-radius:2px}.range{position:absolute;top:1px;height:25px;border-left:2px solid var(--accent2);border-right:2px solid var(--accent2)}.range:before{content:"";position:absolute;left:50%;top:0;height:25px;border-left:2px solid var(--accent2)}.value{text-align:right;font-variant-numeric:tabular-nums}.value strong{font-size:15px}.empty{color:var(--muted);font-style:italic}.section{margin-top:34px}.section h2{font-size:18px;margin:0 0 4px}.section-note,.foot{color:var(--muted);font-size:12px}.category{margin-top:24px}.category h3{font-size:14px;margin:0 0 5px;color:var(--muted);font-weight:500}.category .row{min-height:48px}.category .bar{top:6px;height:13px}.category .range{top:2px;height:21px}.callout{border-left:2px solid var(--accent);padding:10px 12px;margin-top:24px;background:#141915;color:var(--muted);font-size:12px}.callout strong{color:var(--text)}@media(max-width:720px){main{padding:26px 14px 50px}h1{font-size:32px}.axis,.row{grid-template-columns:145px 1fr 74px;gap:9px}.row{min-height:55px}.label strong{font-size:12px}}
</style></head><body><main><div class="eyebrow">UseJunction / workflow benchmark lab</div><h1>Workflow benchmark</h1><p class="lede">A compact view of how coding workflows perform in the last 60 days, using the manually reviewed sample and approved local usage aggregates.</p><div class="meta"><span>${labels.length} manually reviewed sessions · ${manual.window.from} → ${manual.window.to}</span><span>Model × harness where cost is measurable</span></div><div class="controls"><h2 id="title">Completion rate</h2><div class="buttons" role="group" aria-label="Benchmark metric"><button data-metric="completion" aria-pressed="true">Completion</button><button data-metric="oneShot" aria-pressed="false">One-shot</button><button data-metric="verification" aria-pressed="false">Verification</button><button data-metric="failure" aria-pressed="false">Failures</button><button data-metric="costPerTask" aria-pressed="false">Cost / task</button></div></div><div class="axis"><span>Model · harness</span><div class="ticks" id="ticks"><span>0%</span><span>20%</span><span>40%</span><span>60%</span><span>80%</span><span>100%</span></div><span></span></div><div id="leaderboard" class="leaderboard" aria-live="polite"></div><p class="foot" id="foot"></p><section class="section"><h2>Task slices</h2><p class="section-note">The same metric, split by task category. Empty cells remain unmeasured.</p><div id="categories"></div></section><div class="callout"><strong>Cost caveat:</strong> cost / task is an allocated estimate. Approved caches report cost by date, model, and harness—not by task—so each matching day/model/harness total is divided across its observed sessions. It is useful for directional comparison, not billing.</div></main><script>const DATA=${data};const TITLES={completion:"Completion rate",oneShot:"One-shot rate",verification:"Strong verification rate",failure:"Failure rate",costPerTask:"Median allocated cost / task"};const COST_MAX=Math.max(1,Math.ceil(Math.max(...DATA.costRows.map((row)=>row.metrics.costPerTask.value||0),1)/5)*5);const esc=(value)=>String(value).replace(/[&<>\"]/g,(char)=>({"&":"&amp;","<":"&lt;",">":"&gt;","\\\"":"&quot;"}[char]));const pct=(value)=>value===null?"Not measured":Math.round(value)+"%";const dollars=(value)=>value===null?"Not measured":"$"+value.toFixed(2);function metricValue(metric,value){return metric==="costPerTask"?dollars(value):pct(value)}function axis(metric){if(metric!=="costPerTask")return ["0%","20%","40%","60%","80%","100%"];return [0,0.25,0.5,0.75,1].map((n)=>"$"+(COST_MAX*n).toFixed(0));}function rowHtml(item,metric){const m=item.metrics[metric];if(!m||m.value===null)return '<div class="row"><div class="label"><strong>'+esc(item.label)+'</strong><span>'+esc(item.sub)+'</span></div><div class="empty">Not measured</div><div class="value">—</div></div>';const scale=metric==="costPerTask"?COST_MAX:100;const width=Math.min(100,Math.max(0,(m.value/scale)*100));const left=Math.min(100,Math.max(0,((m.low??m.value)/scale)*100));const range=Math.max(0,Math.min(100,((m.high??m.value)/scale)*100)-left);return '<div class="row"><div class="label"><strong>'+esc(item.label)+'</strong><span>'+esc(item.sub)+' · n='+m.n+'</span></div><div class="track" aria-label="'+esc(item.label)+': '+metricValue(metric,m.value)+'"><div class="bar" style="width:'+width+'%"></div><div class="range" style="left:'+left+'%;width:'+range+'%"></div></div><div class="value"><strong>'+metricValue(metric,m.value)+'</strong><span>'+(metric==="costPerTask"?"p25–p75":"95% range")+'</span></div></div>'}function render(metric){document.getElementById("title").textContent=TITLES[metric];document.getElementById("ticks").innerHTML=axis(metric).map((tick)=>'<span>'+tick+'</span>').join("");const isCost=metric==="costPerTask";const rows=isCost?DATA.costRows:DATA.harness;document.getElementById("leaderboard").innerHTML=rows.length?rows.map((item)=>rowHtml(item,metric)).join(""): '<div class="empty" style="padding:24px 0">No measured cost/task mappings were found.</div>';const groups=isCost?DATA.costCategoryRows:DATA.categories;document.getElementById("categories").innerHTML=groups.map((group)=>group.rows.length?'<div class="category"><h3>'+esc(group.category)+'</h3>'+group.rows.map((item)=>rowHtml(item,metric)).join("")+'</div>':"").join("");document.getElementById("foot").textContent=isCost?"Matched allocated task sessions: "+DATA.costMatchCount+" of "+DATA.totalSessions+" parsed sessions. Lower is cheaper.":"Bars show the observed rate; green markers show an approximate 95% interval. Unknown outcomes are excluded from the relevant denominator."}document.querySelectorAll("button[data-metric]").forEach((button)=>button.addEventListener("click",()=>{document.querySelectorAll("button[data-metric]").forEach((candidate)=>candidate.setAttribute("aria-pressed",String(candidate===button)));render(button.dataset.metric)}));render("completion");</script></body></html>`;

await mkdir(join(root, "reports"), { recursive: true });
const lightCss = `:root{color-scheme:light;--bg:#f7fafc;--panel:#ffffff;--line:#d7e0e7;--muted:#61707c;--text:#1b2a35;--accent:#c9f43d;--bar:#2e6b96;--range:#7da4bd}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:14px/1.45 ui-sans-serif,system-ui,-apple-system,sans-serif}main{max-width:1120px;margin:auto;padding:36px 24px 64px}.eyebrow{color:var(--muted);font-size:12px;font-weight:600;letter-spacing:.12em;text-transform:uppercase}h1{font-size:38px;line-height:1.05;letter-spacing:-.05em;margin:10px 0 8px}.lede{color:var(--muted);max-width:720px;margin:0 0 24px}.leaderboard{border-top:1px solid var(--line)}.controls{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;margin:26px 0 14px}.controls h2{font-size:18px;margin:0}.buttons{display:flex;gap:4px;flex-wrap:wrap}.buttons button{border:1px solid #c5d0d8;background:#fff;color:var(--muted);border-radius:4px;padding:7px 10px;cursor:pointer}.buttons button[aria-pressed=true]{background:var(--accent);border-color:#a9ca2d;color:#18220d;font-weight:700}.meta{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;color:var(--muted);font-size:12px;margin:8px 0 18px}.axis{display:grid;grid-template-columns:235px minmax(0,1fr) 90px;gap:16px;color:var(--muted);font-size:11px;margin:0 0 6px}.ticks{display:flex;justify-content:space-between}.row{display:grid;grid-template-columns:235px minmax(0,1fr) 90px;gap:16px;align-items:center;min-height:61px;border-bottom:1px solid var(--line)}.label{min-width:0}.label strong{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.label span,.value span{display:block;color:var(--muted);font-size:11px}.track{height:26px;position:relative;background:repeating-linear-gradient(to right,transparent 0,transparent calc(20% - 1px),var(--line) 20%);border-bottom:1px solid var(--line)}.track:before{content:"";position:absolute;inset:0;background:linear-gradient(to right,rgba(46,107,150,.12),transparent);pointer-events:none}.bar{position:absolute;left:0;top:5px;height:17px;background:var(--bar);border-radius:2px}.range{position:absolute;top:1px;height:25px;border-left:2px solid var(--range);border-right:2px solid var(--range)}.range:before{content:"";position:absolute;left:50%;top:0;height:25px;border-left:2px solid var(--range)}.value{text-align:right;font-variant-numeric:tabular-nums}.value strong{font-size:15px}.empty{color:var(--muted);font-style:italic}.section{margin-top:34px}.section h2,.curve-section h2{font-size:18px;margin:0 0 4px}.section-note,.foot{color:var(--muted);font-size:12px}.category{margin-top:24px}.category h3{font-size:14px;margin:0 0 5px;color:var(--muted);font-weight:500}.category .row{min-height:48px}.category .bar{top:6px;height:13px}.category .range{top:2px;height:21px}.callout{border-left:2px solid #8fb52a;padding:10px 12px;margin-top:24px;background:#f0f7df;color:var(--muted);font-size:12px}.callout strong{color:var(--text)}.curve-section{margin-top:34px;padding-top:20px;border-top:1px solid var(--line)}.curve-section h2{margin-bottom:3px}.curve-note{color:var(--muted);font-size:12px;margin:0 0 12px}.curve-wrap{background:#fff;border:1px solid var(--line);border-radius:6px;padding:10px 8px}.curve-wrap svg{display:block;width:100%;height:auto}@media(max-width:720px){main{padding:26px 14px 50px}h1{font-size:32px}.axis,.row{grid-template-columns:120px minmax(0,1fr) 54px;gap:8px}.row{min-height:55px}.label strong{font-size:12px}.value strong{font-size:13px}.value span{font-size:10px}.meta{display:block}.meta span{display:block;margin-bottom:4px}}`;
const curveData = JSON.stringify(costRows).replaceAll("</", "<\\/");
const curveMarkup = `<section class="curve-section"><h2>Cost / task curve</h2><p class="curve-note">Lower and farther left is cheaper. Points are median allocated cost per task; labels show the matching model × harness.</p><div class="curve-wrap"><svg id="costCurve" viewBox="0 0 760 ${Math.max(180, costRows.length * 38 + 56)}" role="img" aria-label="Cost per task curve"></svg></div></section>`;
const curveScript = `<script>(function(){const rows=${curveData};const svg=document.getElementById("costCurve");if(!svg||!rows.length)return;const NS="http://www.w3.org/2000/svg";const width=760;const left=230;const right=60;const top=26;const rowH=38;const plot=width-left-right;const max=Math.max(...rows.map((row)=>row.metrics.costPerTask.value||0),1);const ceiling=Math.max(1,Math.ceil(max/5)*5);const make=(tag,attrs)=>{const node=document.createElementNS(NS,tag);for(const [key,value] of Object.entries(attrs))node.setAttribute(key,String(value));return node};const text=(x,y,value,size=11,fill="#61707c")=>{const node=make("text",{x,y,"font-size":size,fill,"font-family":"ui-sans-serif,system-ui,sans-serif"});node.textContent=value;return node};for(let i=0;i<=4;i++){const x=left+(plot*i/4);svg.append(make("line",{x1:x,y1:top-10,x2:x,y2:top+rows.length*rowH-8,stroke:"#d7e0e7","stroke-width":1}));svg.append(text(x,16,"$"+(ceiling*i/4).toFixed(0),10));}const points=[];rows.forEach((row,index)=>{const y=top+index*rowH+8;const value=row.metrics.costPerTask.value||0;const x=left+(value/ceiling)*plot;svg.append(text(0,y+4,row.label,11,"#1b2a35"));svg.append(text(0,y+18,row.sub,10,"#61707c"));svg.append(make("line",{x1:left,y1:y,x2:left+plot,y2:y,stroke:"#edf1f4","stroke-width":1}));points.push(x+","+y);});if(points.length>1)svg.append(make("polyline",{points:points.join(" "),fill:"none",stroke:"#7da4bd","stroke-width":2}));rows.forEach((row,index)=>{const y=top+index*rowH+8;const value=row.metrics.costPerTask.value||0;const x=left+(value/ceiling)*plot;svg.append(make("circle",{cx:x,cy:y,r:5,fill:"#2e6b96",stroke:"#ffffff","stroke-width":2}));svg.append(text(left+plot+8,y+4,"$"+value.toFixed(2),11,"#1b2a35"));});})();</script>`;
const chartCss = `.analysis-section{margin-top:36px;padding-top:22px;border-top:1px solid var(--line)}.analysis-section h2{font-size:18px;margin:0 0 4px}.analysis-note{color:var(--muted);font-size:12px;margin:0 0 14px}.analysis-buttons{display:flex;gap:4px;flex-wrap:wrap;margin:12px 0}.analysis-buttons button{border:1px solid #c5d0d8;background:#fff;color:var(--muted);border-radius:4px;padding:6px 9px;cursor:pointer}.analysis-buttons button[aria-pressed=true]{background:var(--accent);border-color:#a9ca2d;color:#18220d;font-weight:700}.analysis-axis,.achievement-row{display:grid;grid-template-columns:270px minmax(0,1fr) 80px;gap:14px}.analysis-axis{color:var(--muted);font-size:11px;margin:16px 0 5px}.analysis-ticks{display:flex;justify-content:space-between}.achievement-row{align-items:center;min-height:48px;border-top:1px solid var(--line)}.achievement-label{min-width:0}.achievement-label strong{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.achievement-label span{display:block;color:var(--muted);font-size:11px}.analysis-track{height:20px;position:relative;background:repeating-linear-gradient(to right,transparent 0,transparent calc(20% - 1px),var(--line) 20%);border-bottom:1px solid var(--line)}.analysis-bar{position:absolute;left:0;top:3px;height:13px;background:var(--bar);border-radius:2px}.analysis-range{position:absolute;top:0;height:19px;border-left:2px solid var(--range);border-right:2px solid var(--range)}.analysis-value{text-align:right;font-variant-numeric:tabular-nums}.analysis-value strong{font-size:14px}.analysis-value span{display:block;color:var(--muted);font-size:10px}.usage-layout{display:grid;grid-template-columns:minmax(240px,.8fr) minmax(360px,1.2fr);gap:22px;align-items:start}.usage-bars{border-top:1px solid var(--line)}.usage-bar-row{display:grid;grid-template-columns:190px minmax(0,1fr) 54px;gap:10px;align-items:center;min-height:43px;border-bottom:1px solid var(--line)}.usage-bar-label{min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:12px}.usage-bar-track{height:14px;background:#e8eef2;position:relative}.usage-bar-fill{position:absolute;inset:0 auto 0 0;background:var(--bar)}.usage-share{text-align:right;font-size:12px;font-variant-numeric:tabular-nums}.scatter-box{background:#fff;border:1px solid var(--line);border-radius:6px;padding:8px}.scatter-box svg{display:block;width:100%;height:auto}.scatter-legend{color:var(--muted);font-size:11px;margin-top:8px}@media(max-width:800px){.analysis-axis,.achievement-row{grid-template-columns:150px minmax(0,1fr) 58px;gap:8px}.usage-layout{grid-template-columns:1fr}.usage-bar-row{grid-template-columns:150px minmax(0,1fr) 48px;gap:8px}}`;
const explainerCss = `.read-box{border-left:3px solid #a9ca2d;background:#f1f7df;color:var(--muted);padding:10px 12px;margin:12px 0;font-size:12px}.read-box strong{color:var(--text)}.chart-summary{border-top:1px solid var(--line);margin-top:12px;padding-top:10px;color:var(--muted);font-size:12px}.chart-summary strong{color:var(--text)}.frontier-box{background:#fff;border:1px solid var(--line);border-radius:6px;padding:8px}.frontier-box svg{display:block;width:100%;height:auto}.frontier-axis{font-size:11px;fill:var(--muted)}.frontier-label{font-size:11px;fill:var(--text)}.frontier-point{fill:var(--bar);stroke:#fff;stroke-width:2}.frontier-line{fill:none;stroke:#7da4bd;stroke-width:2}.frontier-grid{stroke:var(--line);stroke-width:1}.frontier-frontier{fill:none;stroke:#a9ca2d;stroke-width:3;stroke-dasharray:5 4}@media(max-width:800px){.frontier-label{font-size:9px}}`;
const achievementMarkup = `<section class="analysis-section"><h2>Model vs task achievement</h2><p class="analysis-note">Each row is a model × harness roll-up across its observed task sessions. Task-category detail remains in the slices below.</p><div class="read-box"><strong>How to read this:</strong> “sessions” is the total task-session count. “measured” is the smaller number where that specific signal was observable. A 100% bar with measured=1 is not a strong result. Request volume is not used in this rate.</div><div class="analysis-buttons" role="group" aria-label="Achievement signal"><button data-achievement-metric="accepted" aria-pressed="true">User accepted</button><button data-achievement-metric="tests" aria-pressed="false">Tests passed</button><button data-achievement-metric="builds" aria-pressed="false">Builds passed</button></div><div class="analysis-axis"><span>Model · harness</span><div class="analysis-ticks"><span>0%</span><span>20%</span><span>40%</span><span>60%</span><span>80%</span><span>100%</span></div><span></span></div><div id="achievementRows"></div><div id="achievementSummary" class="chart-summary"></div></section>`;
const efficiencyMarkup = `<section class="analysis-section"><h2>Achievement × cost frontier</h2><p class="analysis-note">This is the closest equivalent to the DeepSWE curve: higher is better achievement, farther right is lower allocated cost per task.</p><div class="read-box"><strong>What to look for:</strong> points toward the upper-right are more efficient. Do not call a winner when its measured outcome count is small or its uncertainty range overlaps the alternatives.</div><div class="analysis-buttons" role="group" aria-label="Frontier signal"><button data-frontier-metric="accepted" aria-pressed="true">User accepted</button><button data-frontier-metric="tests" aria-pressed="false">Tests passed</button><button data-frontier-metric="builds" aria-pressed="false">Builds passed</button></div><div class="frontier-box"><svg id="frontierChart" viewBox="0 0 820 430" role="img" aria-label="Achievement versus allocated cost frontier"></svg></div><div id="frontierSummary" class="chart-summary"></div></section>`;
const usageMarkup = `<section class="analysis-section"><h2>Usage composition vs achievement</h2><p class="analysis-note">The bars show each model × harness share of measured input + output tokens. The dots show outcome evidence only when the same model × harness also has task sessions.</p><div class="read-box"><strong>Important separation:</strong> Codex, Cursor, and other harnesses can generate very different numbers of internal requests. Request volume is context only; it is never the denominator for acceptance, tests, or builds. A missing dot means “no linked task outcome,” not failure.</div><div class="analysis-buttons" role="group" aria-label="Usage achievement signal"><button data-usage-metric="accepted" aria-pressed="true">User accepted</button><button data-usage-metric="tests" aria-pressed="false">Tests passed</button><button data-usage-metric="builds" aria-pressed="false">Builds passed</button></div><div class="usage-layout"><div id="usageBars" class="usage-bars"></div><div class="scatter-box"><svg id="usageAchievementChart" viewBox="0 0 620 360" role="img" aria-label="Usage share versus achievement"></svg><div class="scatter-legend">X = token usage share · Y = selected task outcome · each dot is labelled when a signal is measured.</div></div></div><div id="usageSummary" class="chart-summary"></div><div id="usageOnly" class="chart-summary"></div></section>`;
const achievementRowsData = JSON.stringify(modelAchievementRows).replaceAll("</", "<\\/");
const usageRowsData = JSON.stringify(usageRows).replaceAll("</", "<\\/");
const achievementScript = `<script>(function(){const rows=${achievementRowsData};const usage=${usageRowsData};const escapeText=(value)=>String(value).replace(/[&<>\"]/g,(char)=>({"&":"&amp;","<":"&lt;",">":"&gt;","\\\"":"&quot;"}[char]));const percent=(value)=>value===null?"Not measured":Math.round(value)+"%";function renderAchievement(metric){const target=document.getElementById("achievementRows");const ordered=[...rows].filter((row)=>row.metrics[metric].value!==null).sort((a,b)=>(b.metrics[metric].value??-1)-(a.metrics[metric].value??-1));target.innerHTML=ordered.length?ordered.map((row)=>{const m=row.metrics[metric];const left=m.low??m.value;const width=m.value??0;const range=Math.max(0,(m.high??m.value)-left);return '<div class="achievement-row"><div class="achievement-label"><strong>'+escapeText(row.label)+'</strong><span>'+escapeText(row.sub)+' · n='+m.n+'</span></div><div class="analysis-track"><div class="analysis-bar" style="width:'+width+'%"></div><div class="analysis-range" style="left:'+left+'%;width:'+range+'%"></div></div><div class="analysis-value"><strong>'+percent(m.value)+'</strong><span>95% range</span></div></div>'}).join(""): '<p class="analysis-note">No measured '+metric+' outcomes for model-labelled sessions.</p>'}function renderUsage(metric){const bars=document.getElementById("usageBars");bars.innerHTML=usage.map((row)=>'<div class="usage-bar-row"><div class="usage-bar-label" title="'+escapeText(row.label)+'">'+escapeText(row.label)+'</div><div class="usage-bar-track"><div class="usage-bar-fill" style="width:'+row.usageShare+'%"></div></div><div class="usage-share">'+row.usageShare.toFixed(1)+'%</div></div>').join("");const svg=document.getElementById("usageAchievementChart");while(svg.firstChild)svg.removeChild(svg.firstChild);const NS="http://www.w3.org/2000/svg";const make=(tag,attrs)=>{const node=document.createElementNS(NS,tag);for(const [key,value] of Object.entries(attrs))node.setAttribute(key,String(value));return node};const label=(x,y,value,size=11,fill="#61707c")=>{const node=make("text",{x,y,"font-size":size,fill,"font-family":"ui-sans-serif,system-ui,sans-serif"});node.textContent=value;return node};const left=46;const top=20;const width=520;const height=270;const axisX=(value)=>left+(value/100)*width;const axisY=(value)=>top+height-(value/100)*height;for(let i=0;i<=4;i++){const x=axisX(i*25);const y=axisY(i*25);svg.append(make("line",{x1:x,y1:top,x2:x,y2:top+height,stroke:"#d7e0e7","stroke-width":1}));svg.append(make("line",{x1:left,y1:y,x2:left+width,y2:y,stroke:"#d7e0e7","stroke-width":1}));svg.append(label(x-8,top+height+20,(i*25)+"%",10));svg.append(label(4,y+4,(i*25)+"%",10));}svg.append(label(left+width-78,top+height+38,"usage share",10));svg.append(label(4,14,metric+" rate",10));usage.forEach((row)=>{const m=row.metrics[metric];if(m.value===null)return;const x=axisX(row.usageShare);const y=axisY(m.value);const circle=make("circle",{cx:x,cy:y,r:5,fill:"#2e6b96",stroke:"#ffffff","stroke-width":2});const title=make("title",{});title.textContent=row.label+" · usage "+row.usageShare.toFixed(1)+"% · "+percent(m.value);circle.append(title);svg.append(circle);});}document.querySelectorAll("button[data-achievement-metric]").forEach((button)=>button.addEventListener("click",()=>{document.querySelectorAll("button[data-achievement-metric]").forEach((candidate)=>candidate.setAttribute("aria-pressed",String(candidate===button)));renderAchievement(button.dataset.achievementMetric)}));document.querySelectorAll("button[data-usage-metric]").forEach((button)=>button.addEventListener("click",()=>{document.querySelectorAll("button[data-usage-metric]").forEach((candidate)=>candidate.setAttribute("aria-pressed",String(candidate===button)));renderUsage(button.dataset.usageMetric)}));renderAchievement("accepted");renderUsage("accepted");})();</script>`;
const explainerRowsData = JSON.stringify(modelAchievementRows).replaceAll("</", "<\\/");
const explainerUsageData = JSON.stringify(usageRows).replaceAll("</", "<\\/");
const explainerUsageOnlyData = JSON.stringify(usageOnlyRows).replaceAll("</", "<\\/");
const explainerFrontierData = JSON.stringify(efficiencyRows).replaceAll("</", "<\\/");
const explainerScript = `<script>
(function(){
  const rows=${explainerRowsData};
  const usage=${explainerUsageData};
  const frontier=${explainerFrontierData};
  const esc=(value)=>String(value).replace(/[&<>\"]/g,(char)=>({"&":"&amp;","<":"&lt;",">":"&gt;","\\\"":"&quot;"}[char]));
  const pct=(value)=>value===null?"Not measured":Math.round(value)+"%";
  const short=(value)=>String(value).split(" · ")[0].replace("claude-","c-").slice(0,22);
  const make=(tag,attrs)=>{const node=document.createElementNS("http://www.w3.org/2000/svg",tag);for(const [key,value] of Object.entries(attrs))node.setAttribute(key,String(value));return node};
  const svgText=(x,y,value,size=11,fill="#61707c")=>{const node=make("text",{x,y,"font-size":size,fill,"font-family":"ui-sans-serif,system-ui,sans-serif"});node.textContent=value;return node};
  function renderAchievement(metric){
    const ordered=[...rows].filter((row)=>row.metrics[metric].value!==null).sort((a,b)=>(b.metrics[metric].value??-1)-(a.metrics[metric].value??-1));
    document.getElementById("achievementRows").innerHTML=ordered.length?ordered.map((row)=>{const m=row.metrics[metric];const left=m.low??m.value;const range=Math.max(0,(m.high??m.value)-left);return '<div class="achievement-row"><div class="achievement-label"><strong>'+esc(row.label)+'</strong><span>'+esc(row.sub)+' · measured='+m.n+'</span></div><div class="analysis-track"><div class="analysis-bar" style="width:'+m.value+'%"></div><div class="analysis-range" style="left:'+left+'%;width:'+range+'%"></div></div><div class="analysis-value"><strong>'+pct(m.value)+'</strong><span>uncertainty</span></div></div>'}).join(""): '<p class="analysis-note">No measured '+metric+' outcomes are available for the model-labelled sessions.</p>';
    const summary=document.getElementById("achievementSummary");
    if(!ordered.length){summary.textContent="No conclusion is supported by the available signal.";return}
    const best=ordered[0];const m=best.metrics[metric];
    summary.innerHTML=m.n>=10?'<strong>Observed pattern:</strong> '+esc(best.label)+' is highest at '+pct(m.value)+' with '+m.n+' measured outcomes. This is a directional signal, not a universal ranking.':'<strong>Observed pattern:</strong> the highest visible rate is '+pct(m.value)+' for '+esc(best.label)+', but only '+m.n+' outcomes were measured. There is no defensible leader yet.';
  }
  function renderUsage(metric){
    document.getElementById("usageBars").innerHTML=usage.slice(0,12).map((row)=>'<div class="usage-bar-row"><div class="usage-bar-label" title="'+esc(row.label)+'">'+esc(row.label)+'</div><div class="usage-bar-track"><div class="usage-bar-fill" style="width:'+row.usageShare+'%"></div></div><div class="usage-share">'+row.usageShare.toFixed(1)+'%</div></div>').join("");
    const svg=document.getElementById("usageAchievementChart");while(svg.firstChild)svg.removeChild(svg.firstChild);const left=46,top=20,width=520,height=270;const ax=(v)=>left+v/100*width;const ay=(v)=>top+height-v/100*height;
    for(let i=0;i<=4;i++){const value=i*25;svg.append(make("line",{x1:ax(value),y1:top,x2:ax(value),y2:top+height,stroke:"#d7e0e7","stroke-width":1}));svg.append(make("line",{x1:left,y1:ay(value),x2:left+width,y2:ay(value),stroke:"#d7e0e7","stroke-width":1}));svg.append(svgText(ax(value)-8,top+height+20,value+"%",10));svg.append(svgText(4,ay(value)+4,value+"%",10));}
    svg.append(svgText(left+width-78,top+height+38,"usage share",10));svg.append(svgText(4,14,metric+" rate",10));
    const measured=usage.filter((row)=>row.metrics[metric].value!==null);for(const row of measured){const m=row.metrics[metric];const circle=make("circle",{cx:ax(row.usageShare),cy:ay(m.value),r:5,fill:"#2e6b96",stroke:"#ffffff","stroke-width":2});const title=make("title",{});title.textContent=row.label+" · usage "+row.usageShare.toFixed(1)+"% · "+pct(m.value);circle.append(title);svg.append(circle);if(row.usageShare>=1||m.n>=5)svg.append(svgText(ax(row.usageShare)+7,ay(m.value)-7,short(row.label),10,"#1b2a35"));}
    const topUse=usage[0];const best=[...measured].sort((a,b)=>(b.metrics[metric].value??-1)-(a.metrics[metric].value??-1))[0];document.getElementById("usageSummary").innerHTML='<strong>Read the split:</strong> '+esc(topUse?.label??"No usage data")+' accounts for '+(topUse?.usageShare??0).toFixed(1)+'% of measured tokens. '+(best?esc(best.label)+' has the highest measured '+metric+' rate at '+pct(best.metrics[metric].value)+'. These are separate facts; usage share is not an achievement score.':"No linked task outcome is measured for the plotted usage rows.");
  }
  function renderFrontier(metric){
    const svg=document.getElementById("frontierChart");while(svg.firstChild)svg.removeChild(svg.firstChild);const left=70,top=28,width=680,height=320;const maxCost=Math.max(1,Math.ceil(Math.max(...frontier.map((row)=>row.cost||0),1)/5)*5);const ax=(v)=>left+width-v/maxCost*width;const ay=(v)=>top+height-v/100*height;
    for(let i=0;i<=4;i++){const value=i*25;svg.append(make("line",{x1:left,y1:ay(value),x2:left+width,y2:ay(value),class:"frontier-grid"}));svg.append(svgText(8,ay(value)+4,value+"%",10));const cost=maxCost*i/4;svg.append(svgText(ax(cost)-10,top+height+22,"$"+cost.toFixed(0),10));}svg.append(svgText(left+width-118,18,"more efficient ↗",11,"#61707c"));svg.append(svgText(left+width-112,top+height+42,"lower cost",10));svg.append(svgText(left-2,14,metric+" rate",10));
    const points=frontier.filter((row)=>row.metrics[metric].value!==null).sort((a,b)=>b.cost-a.cost);const coords=points.map((row)=>({row,x:ax(row.cost),y:ay(row.metrics[metric].value),value:row.metrics[metric].value}));if(coords.length>1)svg.append(make("polyline",{points:coords.map((point)=>point.x+","+point.y).join(" "),class:"frontier-line"}));for(const point of coords){const circle=make("circle",{cx:point.x,cy:point.y,r:6,class:"frontier-point"});const title=make("title",{});title.textContent=point.row.label+" · $"+point.row.cost.toFixed(2)+" / task · "+pct(point.value);circle.append(title);svg.append(circle);svg.append(svgText(point.x+8,point.y-8,short(point.row.label),10,"#1b2a35"));}document.getElementById("frontierSummary").innerHTML=coords.length?'<strong>How to interpret it:</strong> move up for stronger task achievement and right for lower allocated cost. Upper-right points are efficient candidates, but overlapping uncertainty or small measured counts prevent a winner claim.':'No model × harness rows have both allocated cost and measured task achievement.';
  }
  document.querySelectorAll("button[data-achievement-metric]").forEach((button)=>button.addEventListener("click",()=>{document.querySelectorAll("button[data-achievement-metric]").forEach((candidate)=>candidate.setAttribute("aria-pressed",String(candidate===button)));renderAchievement(button.dataset.achievementMetric)}));
  document.querySelectorAll("button[data-usage-metric]").forEach((button)=>button.addEventListener("click",()=>{document.querySelectorAll("button[data-usage-metric]").forEach((candidate)=>candidate.setAttribute("aria-pressed",String(candidate===button)));renderUsage(button.dataset.usageMetric)}));
  document.querySelectorAll("button[data-frontier-metric]").forEach((button)=>button.addEventListener("click",()=>{document.querySelectorAll("button[data-frontier-metric]").forEach((candidate)=>candidate.setAttribute("aria-pressed",String(candidate===button)));renderFrontier(button.dataset.frontierMetric)}));
  renderAchievement("accepted");renderUsage("accepted");renderFrontier("accepted");
})();
</script>`;
const usageOnlyScript = `<script>(function(){const rows=${explainerUsageOnlyData};const target=document.getElementById("usageOnly");if(!target||!rows.length)return;target.innerHTML='<strong>Usage-only models:</strong> '+rows.slice(0,8).map((row)=>row.label+' ('+row.usageShare.toFixed(1)+'% usage)').join(' · ')+' · no linked task outcome is available, so no achievement rate is shown.'})();</script>`;
const styledHtml = html.replace(/<style>[\s\S]*?<\/style>/, `<style>${lightCss}${chartCss}${explainerCss}</style>`).replace('<div class="callout">', `${achievementMarkup}${efficiencyMarkup}${usageMarkup}<div class="callout">`).replace('<section class="section"><h2>Task slices</h2>', `${curveMarkup}<section class="section"><h2>Task slices</h2>`).replace("</body></html>", `${curveScript}${achievementScript}${explainerScript}${usageOnlyScript}</body></html>`);
await writeFile(join(root, "reports", "manual-benchmark-chart-60d.html"), styledHtml, "utf8");
console.log(`Benchmark chart generated: ${join(root, "reports", "manual-benchmark-chart-60d.html")}`);
