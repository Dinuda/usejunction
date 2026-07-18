export function workSessionPath(sessionId: string) {
  return `/signals/activity/work/${sessionId}`;
}

function stripMarkdownForDisplay(text: string) {
  let out = text;
  out = out.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1");
  out = out.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
  // Truncated titles can end mid-link; keep the label, drop the path fragment.
  out = out.replace(/\[([^\]]+)\]\([^)]*$/g, "$1");
  out = out.replace(/\[([^\]]+)$/g, "$1");
  out = out.replace(/`([^`]+)`/g, "$1");
  out = out.replace(/^#{1,6}\s+/gm, "");
  out = out.replace(/\*\*([^*]+)\*\*/g, "$1");
  out = out.replace(/__([^_]+)__/g, "$1");
  out = out.replace(/\*([^*]+)\*/g, "$1");
  out = out.replace(/_([^_]+)_/g, "$1");
  return out.replace(/\s+/g, " ").trim();
}

export function displayWorkTitle(title: string | null | undefined, tldr?: string | null) {
  const raw = (title || tldr || "Untitled session").trim();
  return stripMarkdownForDisplay(raw);
}
