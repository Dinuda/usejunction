/**
 * Clears onboardingCompletedAt for an e2e user so onboarding UI tests can run.
 * Usage: dotenv -e ../../.env -- tsx e2e/set-onboarding.ts owner@example.com incomplete
 */
import { loadEnvConfig } from "@next/env";
import path from "node:path";

const loadedEnv = loadEnvConfig(path.join(__dirname, "../.."));
if (!process.env.DATABASE_URL && loadedEnv.combinedEnv.DATABASE_URL) {
  process.env.DATABASE_URL = loadedEnv.combinedEnv.DATABASE_URL;
}

const email = process.argv[2];
const mode = process.argv[3] ?? "incomplete";

if (!email) {
  console.error("Usage: tsx e2e/set-onboarding.ts <email> [incomplete|complete]");
  process.exit(1);
}

async function main() {
  const { prisma } = await import("@usejunction/db");
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) {
    console.error(`User not found: ${email}`);
    process.exit(1);
  }

  const now = new Date("2026-07-16T12:00:00.000Z");
  await prisma.organizationMembership.updateMany({
    where: { userId: user.id },
    data: { onboardingCompletedAt: mode === "complete" ? now : null },
  });

  console.log(JSON.stringify({ email, mode, onboardingCompletedAt: mode === "complete" ? now.toISOString() : null }));
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
