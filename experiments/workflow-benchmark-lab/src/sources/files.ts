import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join, relative, sep } from "node:path";
import type { Harness, SourceFile } from "../types.js";

async function walk(root: string, predicate: (path: string) => boolean): Promise<string[]> {
  const output: string[] = [];
  async function visit(dir: string) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile() && predicate(path)) output.push(path);
    }
  }
  await visit(root);
  return output;
}

export async function discoverSourceFiles(home = homedir()): Promise<SourceFile[]> {
  const claudeRoot = join(home, ".claude", "projects");
  const codexRoot = join(home, ".codex");
  const cursorRoot = join(home, ".cursor", "projects");
  const usageRoot = join(home, ".usejunction", "cache", "cost-usage");

  const [claude, codex, cursor] = await Promise.all([
    walk(claudeRoot, (path) => path.endsWith(".jsonl")),
    walk(codexRoot, (path) => {
      const normalized = path.split(sep).join("/");
      return (
        path.endsWith(".jsonl") &&
        (normalized.includes("/.codex/sessions/") || normalized.includes("/.codex/archived_sessions/")) &&
        path.includes("rollout-")
      );
    }),
    walk(cursorRoot, (path) => path.endsWith(".jsonl") && path.split(sep).join("/").includes("/agent-transcripts/")),
  ]);

  const sources: SourceFile[] = [
    ...claude.map((path) => ({ harness: "Claude Code" as Harness, kind: "session" as const, path })),
    ...codex.map((path) => ({ harness: "Codex" as Harness, kind: "session" as const, path })),
    ...cursor.map((path) => ({ harness: "Cursor" as Harness, kind: "session" as const, path })),
  ];

  const allowedCaches = new Set([
    "claude.json",
    "codex.json",
    "cursor-usage-events.json",
    "cursor-local.json",
    "opencode-local.json",
    "antigravity-local.json",
    "copilot.json",
  ]);
  try {
    for (const name of await readdir(usageRoot)) {
      if (!allowedCaches.has(name)) continue;
      const path = join(usageRoot, name);
      const info = await stat(path).catch(() => null);
      if (info?.isFile()) sources.push({ harness: "UseJunction", kind: "usage_cache", path });
    }
  } catch {
    // A missing agent/cache directory is a valid empty-data case.
  }

  return sources.sort((a, b) => a.path.localeCompare(b.path));
}

export function isApprovedSourcePath(path: string): boolean {
  const normalized = path.split(sep).join("/");
  const allowedSession =
    (normalized.includes("/.claude/projects/") && normalized.endsWith(".jsonl")) ||
    (normalized.includes("/.codex/sessions/") && normalized.includes("/rollout-") && normalized.endsWith(".jsonl")) ||
    (normalized.includes("/.codex/archived_sessions/") && normalized.includes("/rollout-") && normalized.endsWith(".jsonl")) ||
    (normalized.includes("/.cursor/projects/") && normalized.includes("/agent-transcripts/") && normalized.endsWith(".jsonl"));
  const allowedCache = normalized.includes("/.usejunction/cache/cost-usage/") &&
    ["claude.json", "codex.json", "cursor-usage-events.json", "cursor-local.json", "opencode-local.json", "antigravity-local.json", "copilot.json"].some((name) => normalized.endsWith(`/${name}`));
  return allowedSession || allowedCache;
}
