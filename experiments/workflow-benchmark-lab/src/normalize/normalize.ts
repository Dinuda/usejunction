import { createHash } from "node:crypto";
import type { TaskCategory } from "../types.js";

export function normalizeModel(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.trim().replace(/^\w+\//, "");
  if (!normalized || /unknown|null|undefined/i.test(normalized)) return null;
  if (/^(?:flow:|tool:|ai-lines$|commits$|default$|inherit$|fast$)/i.test(normalized) || normalized.includes(">")) return null;
  return normalized.slice(0, 100);
}

export function classifyTask(text: string): TaskCategory {
  const value = text.toLowerCase();
  if (!value.trim()) return "unknown";
  if (/\b(test|tests|testing|debug|debugging|flaky|failure|failing|broken build)\b/.test(value)) return "testing/debugging";
  if (/\b(fix|bug|issue|error|broken|regression|repair)\b/.test(value)) return "bug fix";
  if (/\b(refactor|cleanup|simplify|rename|restructure|extract|migrate)\b/.test(value)) return "refactor";
  if (/\b(readme|documentation|docs|config|configuration|environment|env|deploy|deployment)\b/.test(value)) return "docs/configuration";
  if (/\b(add|build|create|implement|feature|support|introduce|new)\b/.test(value)) return "feature";
  return "unknown";
}

const repositoryLabels = new Map<string, string>();
export function projectLabel(path: string | null): string {
  if (!path) return "unknown project";
  const normalized = path.replaceAll("\\", "/").replace(/\/+$/, "");
  if (!repositoryLabels.has(normalized)) {
    const id = createHash("sha256").update(normalized).digest("hex").slice(0, 8);
    repositoryLabels.set(normalized, `project-${id}`);
  }
  return repositoryLabels.get(normalized)!;
}

export function resetProjectLabels() {
  repositoryLabels.clear();
}
