import { createReadStream, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { createInterface } from "node:readline";
import { basename } from "node:path";
import type { Acceptance, Harness, SessionRecord, SourceFile, UsageRecord } from "../types.js";
import { isApprovedSourcePath } from "./files.js";
import { classifyTask, normalizeModel, projectLabel } from "../normalize/normalize.js";

type JsonObject = Record<string, unknown>;

const numberKeys = new Set([
  "input_tokens", "inputTokens", "prompt_tokens", "promptTokens",
  "output_tokens", "outputTokens", "completion_tokens", "completionTokens",
  "total_tokens", "totalTokens", "cache_read_tokens", "cacheReadTokens",
  "requests", "request_count", "requestCount",
  "estimated_cost", "estimatedCost", "cost", "cost_usd", "costUsd",
]);

function isObject(value: unknown): value is JsonObject {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, value);
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Math.max(0, Number(value));
  return null;
}

function findNumbers(value: unknown, result: Record<string, number[]> = {}): Record<string, number[]> {
  if (isObject(value)) {
    for (const [key, child] of Object.entries(value)) {
      const numeric = asNumber(child);
      if (numeric !== null && numberKeys.has(key)) (result[key] ??= []).push(numeric);
      else if (isObject(child) || Array.isArray(child)) findNumbers(child, result);
    }
  } else if (Array.isArray(value)) {
    for (const child of value) findNumbers(child, result);
  }
  return result;
}

function findString(value: unknown, keys: Set<string>): string | null {
  if (isObject(value)) {
    for (const [key, child] of Object.entries(value)) {
      if (keys.has(key) && typeof child === "string" && child.trim()) return child.trim();
      const nested = findString(child, keys);
      if (nested) return nested;
    }
  } else if (Array.isArray(value)) {
    for (const child of value) {
      const nested = findString(child, keys);
      if (nested) return nested;
    }
  }
  return null;
}

function findModelValue(value: unknown): string | null {
  const candidates: string[] = [];
  function visit(node: unknown) {
    if (isObject(node)) {
      for (const [key, child] of Object.entries(node)) {
        if (/^model(?:Name|_name|Id|_id)?$/.test(key) && typeof child === "string") candidates.push(child);
        else if (isObject(child) || Array.isArray(child)) visit(child);
      }
    } else if (Array.isArray(node)) for (const child of node) visit(child);
  }
  visit(value);
  for (const candidate of candidates) {
    const normalized = normalizeModel(candidate);
    if (normalized) return normalized;
  }
  return null;
}

function collectText(value: unknown, out: string[] = [], depth = 0): string[] {
  if (depth > 4 || out.join(" ").length > 12_000) return out;
  if (isObject(value)) {
    for (const [key, child] of Object.entries(value)) {
      if (/prompt|query|message|title|summary|task|request/i.test(key) && typeof child === "string") {
        out.push(child.slice(0, 2_000));
      } else if (isObject(child) || Array.isArray(child)) collectText(child, out, depth + 1);
    }
  } else if (Array.isArray(value)) {
    for (const child of value) collectText(child, out, depth + 1);
  }
  return out;
}

function eventTimestamp(value: unknown): Date | null {
  const raw = findString(value, new Set(["timestamp", "created_at", "createdAt", "time", "date"]));
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function eventRole(value: unknown): string | null {
  if (isObject(value)) {
    if (typeof value.role === "string") return value.role;
    if (isObject(value.message) && typeof value.message.role === "string") return value.message.role;
    if (isObject(value.payload) && typeof value.payload.role === "string") return value.payload.role;
    if (value.type === "user" || value.type === "assistant") return value.type;
  }
  return null;
}

function contentText(value: unknown, output: string[] = [], depth = 0): string[] {
  if (depth > 5 || output.join(" ").length > 8_000) return output;
  if (typeof value === "string") { output.push(value.slice(0, 2_000)); return output; }
  if (Array.isArray(value)) { for (const item of value) contentText(item, output, depth + 1); return output; }
  if (isObject(value)) {
    if (typeof value.text === "string") output.push(value.text.slice(0, 2_000));
    else if (typeof value.content === "string") output.push(value.content.slice(0, 2_000));
    else for (const child of Object.values(value)) contentText(child, output, depth + 1);
  }
  return output;
}

function roleTexts(value: unknown, wantedRole: "user" | "assistant", output: string[] = []): string[] {
  if (isObject(value)) {
    const role = eventRole(value);
    if (role === wantedRole) {
      if ("content" in value) contentText(value.content, output);
      if (isObject(value.message) && "content" in value.message) contentText(value.message.content, output);
      if (isObject(value.payload) && "content" in value.payload) contentText(value.payload.content, output);
    }
    for (const [key, child] of Object.entries(value)) {
      if (key === "content" || key === "message" || key === "payload") {
        if (isObject(child) || Array.isArray(child)) roleTexts(child, wantedRole, output);
      }
    }
  } else if (Array.isArray(value)) for (const child of value) roleTexts(child, wantedRole, output);
  return output;
}

function inferAcceptance(events: unknown[]): Acceptance {
  const userMessages = events.flatMap((event) => roleTexts(event, "user")).map((text) => text.trim()).filter(Boolean);
  if (!userMessages.length) return "unclear";
  const recent = userMessages.slice(-4).join(" ").toLowerCase();
  const negative = /\b(still (doesn'?t|does not|isn'?t|fails|broken)|not working|wrong|you missed|doesn'?t work|does not work|try again|revert|undo|that failed|failure|broken|incorrect|not what i asked|no,? that)/i.test(recent);
  const positive = /\b(works|working|looks good|perfect|that'?s correct|correct|approved|ship it|go ahead|done|thanks|thank you|great|exactly|this is good|fixed)\b/i.test(recent) || /^(yes|yep|yup|okay|ok|sounds good|go ahead|do it)[.!]?$/i.test(userMessages.at(-1) ?? "");
  if (negative) return "rejected";
  if (positive) return "accepted";
  return "unclear";
}

function eventStatus(value: unknown): { tool: boolean; failed: boolean; test: "passed" | "failed" | null; build: "passed" | "failed" | null } {
  const role = (eventRole(value) ?? "").toLowerCase();
  const text = collectText(value).join(" ").toLowerCase();
  const tool = /tool|function_call|tool_use|exec_command|terminal|apply_patch|shell/.test(role) ||
    /tool_call|function_call|tool_use|exec_command|apply_patch/.test(text.slice(0, 500));
  const failed = Boolean(
    (isObject(value) && (value.error || value.is_error === true || value.isError === true || value.status === "error" || value.status === "failed")) ||
      /\b(error|failed|failure|exception|exit code [1-9])\b/.test(text),
  );
  const test = /\b(test|tests|vitest|jest|playwright|pytest|go test)\b/.test(text)
    ? (/\b(pass|passed|passing|ok|success)\b/.test(text) && !failed ? "passed" : failed ? "failed" : null)
    : null;
  const build = /\b(build|compile|tsc|next build|cargo build|go build)\b/.test(text)
    ? (/\b(pass|passed|success|compiled)\b/.test(text) && !failed ? "passed" : failed ? "failed" : null)
    : null;
  return { tool, failed, test, build };
}

function findObjectsWithKey(value: unknown, keys: Set<string>, output: JsonObject[] = []): JsonObject[] {
  if (isObject(value)) {
    for (const [key, child] of Object.entries(value)) {
      if (keys.has(key) && isObject(child)) output.push(child);
      else if (isObject(child) || Array.isArray(child)) findObjectsWithKey(child, keys, output);
    }
  } else if (Array.isArray(value)) for (const child of value) findObjectsWithKey(child, keys, output);
  return output;
}

function directNumber(object: JsonObject, keys: string[]): number | null {
  for (const key of keys) {
    const value = asNumber(object[key]);
    if (value !== null) return value;
  }
  return null;
}

function usageTotals(events: unknown[]): { input: number | null; output: number | null; cost: number | null } {
  let input = 0; let output = 0; let cost = 0; let inputSeen = false; let outputSeen = false; let costSeen = false;
  let cumulative: { input: number | null; output: number | null } | null = null;
  for (const event of events) {
    const totals = findObjectsWithKey(event, new Set(["total_token_usage"])).at(-1);
    if (totals) {
      cumulative = { input: directNumber(totals, ["input_tokens", "inputTokens"]), output: directNumber(totals, ["output_tokens", "outputTokens"]) };
      continue;
    }
    const usage = findObjectsWithKey(event, new Set(["usage", "last_token_usage", "token_usage"])).at(-1);
    const values = usage ?? event as JsonObject;
    const inputValue = directNumber(values, ["input_tokens", "inputTokens", "prompt_tokens", "promptTokens"]);
    const outputValue = directNumber(values, ["output_tokens", "outputTokens", "completion_tokens", "completionTokens"]);
    const costValue = directNumber(values, ["estimated_cost", "estimatedCost", "cost_usd", "costUsd"]);
    if (inputValue !== null) { input += inputValue; inputSeen = true; }
    if (outputValue !== null) { output += outputValue; outputSeen = true; }
    if (costValue !== null) { cost += costValue > 100 ? costValue / 1_000_000 : costValue; costSeen = true; }
  }
  return cumulative
    ? { input: cumulative.input === null ? null : Math.round(cumulative.input), output: cumulative.output === null ? null : Math.round(cumulative.output), cost: costSeen ? cost : null }
    : { input: inputSeen ? Math.round(input) : null, output: outputSeen ? Math.round(output) : null, cost: costSeen ? cost : null };
}

function eventDate(events: unknown[], path: string): string {
  const timestamps = events.map(eventTimestamp).filter((date): date is Date => Boolean(date)).sort((a, b) => a.getTime() - b.getTime());
  if (timestamps[0]) return timestamps[0].toISOString().slice(0, 10);
  const match = path.match(/(20\d{2})[\\/-](\d{2})[\\/-](\d{2})/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  return statSync(path).mtime.toISOString().slice(0, 10);
}

export async function readSessionFile(source: SourceFile): Promise<SessionRecord | null> {
  if (source.kind !== "session" || !isApprovedSourcePath(source.path)) return null;
  const events: unknown[] = [];
  const lines = createInterface({ input: createReadStream(source.path), crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line.trim()) continue;
    try { events.push(JSON.parse(line)); } catch { /* tolerate live/truncated sessions */ }
  }
  if (!events.length) return null;
  const dates = events.map(eventTimestamp).filter((date): date is Date => Boolean(date)).sort((a, b) => a.getTime() - b.getTime());
  const statuses = events.map(eventStatus);
  const toolEvents = statuses.filter((status) => status.tool);
  const failed = toolEvents.filter((status) => status.failed).length;
  const recovered = toolEvents.reduce((count, status, index) => count + (status.failed && toolEvents.slice(index + 1).some((next) => !next.failed) ? 1 : 0), 0);
  const text = events.flatMap((event) => collectText(event)).join(" ");
  const usage = usageTotals(events);
  const roles = events.map(eventRole).map((role) => (role ?? "").toLowerCase());
  const turns = roles.filter((role) => role === "user" || role === "assistant" || role.includes("message")).length;
  const iterations = Math.max(0, Math.ceil(toolEvents.length / 3));
  const testStates = statuses.map((status) => status.test).filter((value): value is "passed" | "failed" => Boolean(value));
  const buildStates = statuses.map((status) => status.build).filter((value): value is "passed" | "failed" => Boolean(value));
  const model = findModelValue(events);
  const repositoryPath = findString(events, new Set(["cwd", "workingDirectory", "working_directory", "workspace", "projectPath", "project_path"]));
  const id = createHash("sha256").update(source.path).digest("hex").slice(0, 16);
  return {
    id,
    harness: source.harness,
    model,
    date: eventDate(events, source.path),
    startedAt: dates[0]?.toISOString() ?? null,
    endedAt: dates.at(-1)?.toISOString() ?? null,
    durationMs: dates.length > 1 ? dates.at(-1)!.getTime() - dates[0].getTime() : null,
    turns,
    iterations,
    toolCalls: toolEvents.length,
    failedToolCalls: failed,
    recoveredFailures: recovered,
    inputTokens: usage.input,
    outputTokens: usage.output,
    costUsd: usage.cost,
    repository: projectLabel(repositoryPath),
    taskCategory: classifyTask(text),
    testOutcome: testStates.length ? (testStates.includes("failed") ? "failed" : "passed") : "not_measured",
    buildOutcome: buildStates.length ? (buildStates.includes("failed") ? "failed" : "passed") : "not_measured",
    acceptance: inferAcceptance(events),
    sourceKind: "session",
  };
}

function flattenObjects(value: unknown, output: JsonObject[] = []): JsonObject[] {
  if (isObject(value)) {
    output.push(value);
    for (const child of Object.values(value)) flattenObjects(child, output);
  } else if (Array.isArray(value)) for (const child of value) flattenObjects(child, output);
  return output;
}

export async function readUsageCache(source: SourceFile): Promise<UsageRecord[]> {
  if (source.kind !== "usage_cache" || !isApprovedSourcePath(source.path)) return [];
  let parsed: unknown;
  try { parsed = JSON.parse(await (await import("node:fs/promises")).readFile(source.path, "utf8")); } catch { return []; }
  const records: UsageRecord[] = [];
  for (const item of flattenObjects(parsed)) {
    const model = findModelValue(item)
      ?? (basename(source.path, ".json") === "claude" ? "Claude (unknown model)" : null);
    const values = findNumbers(item);
    const input = (values.input_tokens ?? values.inputTokens ?? values.prompt_tokens ?? [])[0] ?? null;
    const output = (values.output_tokens ?? values.outputTokens ?? values.completion_tokens ?? [])[0] ?? null;
    const costRaw = (values.estimated_cost ?? values.estimatedCost ?? values.cost_usd ?? values.costUsd ?? [])[0];
    const requests = (values.requests ?? [])[0] ?? 0;
    const date = eventDate([item], source.path);
    if (input === null && output === null && costRaw === undefined && !requests) continue;
    records.push({ harness: source.harness, model, date, requests, inputTokens: input === null ? null : Math.round(input), outputTokens: output === null ? null : Math.round(output), costUsd: costRaw === undefined ? null : costRaw > 100 ? costRaw / 1_000_000 : costRaw, sourceKind: "usage_cache" });
  }
  return records;
}
