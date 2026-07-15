/** Public control-plane URL for install/enroll commands (tunnel or production). */
export function getPublicAppUrl() {
  const configured =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    "";
  return configured.replace(/\/$/, "") || "http://localhost:3001";
}

function shellArg(value: string) {
  return `'${value.replaceAll("'", `'\"'\"'`)}'`;
}

export function buildInstallCommand(token: string, controlPlaneUrl: string) {
  const base = controlPlaneUrl.replace(/\/$/, "");
  return `curl -fsSL ${shellArg(`${base}/install.sh`)} | sh -s -- --token ${shellArg(token)} --url ${shellArg(base)}`;
}

export function buildConnectInviteCommand(token: string, pollToken: string, controlPlaneUrl: string) {
  const base = controlPlaneUrl.replace(/\/$/, "");
  return `curl -fsSL ${shellArg(`${base}/install.sh`)} | sh -s -- --connect ${shellArg(token)} --poll-token ${shellArg(pollToken)} --url ${shellArg(base)}`;
}

export function buildConnectInviteUrl(token: string, controlPlaneUrl: string) {
  const base = controlPlaneUrl.replace(/\/$/, "");
  return `${base}/connect-invite/${encodeURIComponent(token)}`;
}

export function buildTeamInviteLinkUrl(token: string, controlPlaneUrl: string) {
  const base = controlPlaneUrl.replace(/\/$/, "");
  return `${base}/i/${encodeURIComponent(token)}`;
}

/**
 * One-liner that POSTs to /api/enroll — simulates agent connect without a full install.
 */
export function buildSimulateConnectCommand(token: string, controlPlaneUrl: string) {
  const base = controlPlaneUrl.replace(/\/$/, "");
  const payload =
    `{"token":"${token}","hostname":"'"$(hostname)"'","os":"'"$(uname -s)"'","architecture":"'"$(uname -m)"'","agentVersion":"sim-0.1.0"}`;
  return `curl -fsS -X POST "${base}/api/enroll" -H "content-type: application/json" -d '${payload}'`;
}
