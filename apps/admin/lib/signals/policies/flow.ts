export type FlowParts = {
  before: string;
  aiTool: string;
  after: string;
};

export function signalsFlow(session: {
  domainBefore: string | null;
  appBefore: string | null;
  aiTool: string;
  domainAfter: string | null;
  appAfter: string | null;
}) {
  return [
    session.domainBefore ?? session.appBefore ?? "unknown",
    session.aiTool,
    session.domainAfter ?? session.appAfter ?? "unknown",
  ].join(" -> ");
}

export function flowPartsFromSession(session: {
  domainBefore: string | null;
  appBefore: string | null;
  aiTool: string;
  domainAfter: string | null;
  appAfter: string | null;
}): FlowParts {
  return {
    before: session.domainBefore ?? session.appBefore ?? "unknown",
    aiTool: session.aiTool,
    after: session.domainAfter ?? session.appAfter ?? "unknown",
  };
}

/** Stable URL-safe key for a before → AI → after journey. */
export function encodeFlowKey(parts: FlowParts): string {
  return [parts.before, parts.aiTool, parts.after]
    .map((part) => encodeURIComponent(part.trim().toLowerCase()))
    .join("__");
}

export function flowKeyFromSession(session: {
  domainBefore: string | null;
  appBefore: string | null;
  aiTool: string;
  domainAfter: string | null;
  appAfter: string | null;
}): string {
  return encodeFlowKey(flowPartsFromSession(session));
}

export function parseFlowKey(flowKey: string): FlowParts | null {
  const chunks = flowKey.split("__");
  if (chunks.length !== 3) return null;
  try {
    return {
      before: decodeURIComponent(chunks[0]!),
      aiTool: decodeURIComponent(chunks[1]!),
      after: decodeURIComponent(chunks[2]!),
    };
  } catch {
    return null;
  }
}

export function displayFlow(parts: FlowParts): string {
  return `${parts.before} -> ${parts.aiTool} -> ${parts.after}`;
}

export function sessionMatchesFlowKey(
  session: {
    domainBefore: string | null;
    appBefore: string | null;
    aiTool: string;
    domainAfter: string | null;
    appAfter: string | null;
  },
  flowKey: string,
): boolean {
  return flowKeyFromSession(session) === flowKey;
}
