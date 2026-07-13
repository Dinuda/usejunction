/**
 * One-liner that POSTs to /api/enroll — simulates agent connect without a full install.
 * Works for founder setup and invited teammates once NEXT_PUBLIC_APP_URL (or NEXTAUTH_URL)
 * points at the tunnel / public origin.
 */
export function buildSimulateConnectCommand(token: string, controlPlaneUrl: string) {
  const base = controlPlaneUrl.replace(/\/$/, "");
  const payload =
    `{"token":"${token}","hostname":"'"$(hostname)"'","os":"'"$(uname -s)"'","architecture":"'"$(uname -m)"'","agentVersion":"sim-0.1.0"}`;
  return `curl -fsS -X POST "${base}/api/enroll" -H "content-type: application/json" -d '${payload}'`;
}
