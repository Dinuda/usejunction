/** Public control-plane URL for install/enroll commands (tunnel or production). */
export function getPublicAppUrl() {
  const configured =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    "";
  return configured.replace(/\/$/, "") || "http://localhost:3001";
}

export function buildInstallCommand(token: string, controlPlaneUrl: string) {
  const base = controlPlaneUrl.replace(/\/$/, "");
  return `curl -fsSL ${base}/install.sh | sh -s -- --token ${token} --url ${base}`;
}

export type PlatformCommands = {
  macosLinux: string;
  windows: string;
};

function powerShellLiteral(value: string) {
  return `'${value.replace(/'/g, "''")}'`;
}

function buildPowerShellCommand(
  tokenFlag: "Token" | "Connect",
  token: string,
  controlPlaneUrl: string,
) {
  const base = controlPlaneUrl.replace(/\/$/, "");
  const scriptUrl = powerShellLiteral(`${base}/install.ps1`);
  return `powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "& ([scriptblock]::Create((Invoke-RestMethod -UseBasicParsing ${scriptUrl}))) -${tokenFlag} ${powerShellLiteral(token)} -Url ${powerShellLiteral(base)}"`;
}

export function buildWindowsInstallCommand(token: string, controlPlaneUrl: string) {
  return buildPowerShellCommand("Token", token, controlPlaneUrl);
}

export function buildPlatformInstallCommands(token: string, controlPlaneUrl: string): PlatformCommands {
  return {
    macosLinux: buildInstallCommand(token, controlPlaneUrl),
    windows: buildWindowsInstallCommand(token, controlPlaneUrl),
  };
}

export function buildConnectInviteCommand(token: string, controlPlaneUrl: string) {
  const base = controlPlaneUrl.replace(/\/$/, "");
  return `curl -fsSL ${base}/install.sh | sh -s -- --connect ${token} --url ${base}`;
}

export function buildWindowsConnectInviteCommand(token: string, controlPlaneUrl: string) {
  return buildPowerShellCommand("Connect", token, controlPlaneUrl);
}

export function buildPlatformConnectInviteCommands(token: string, controlPlaneUrl: string): PlatformCommands {
  return {
    macosLinux: buildConnectInviteCommand(token, controlPlaneUrl),
    windows: buildWindowsConnectInviteCommand(token, controlPlaneUrl),
  };
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
