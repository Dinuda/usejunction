import { execSync } from "node:child_process";
import path from "node:path";

const adminRoot = path.join(__dirname, "..");

export function setOnboardingState(email: string, mode: "incomplete" | "complete") {
  execSync(`pnpm exec dotenv -e ../../.env -- tsx e2e/set-onboarding.ts ${email} ${mode}`, {
    cwd: adminRoot,
    stdio: "pipe",
  });
}
