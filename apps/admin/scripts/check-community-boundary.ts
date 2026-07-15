import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(process.cwd(), "../..");
const forbiddenPaths = [
  "apps/admin/components/public",
  "apps/admin/components/billing/plan-status-card.tsx",
  "apps/admin/lib/public",
  "apps/admin/lib/billing/lemonsqueezy.ts",
  "apps/admin/lib/billing/entitlements.ts",
  "apps/admin/lib/billing/status.ts",
  "apps/admin/app/api/billing/checkout",
  "apps/admin/app/api/billing/portal",
  "apps/admin/app/api/webhooks/lemonsqueezy",
  "apps/admin/app/contact",
  "apps/admin/app/api/contact",
];
const forbiddenText = [
  ["@lemon", "squeezy"].join(""),
  ["LEMON", "SQUEEZY_"].join(""),
  ["Plan", "Interest"].join(""),
];

const failures: string[] = [];
for (const relative of forbiddenPaths) {
  const full = path.join(repoRoot, relative);
  if (!existsSync(full)) continue;
  const remains = statSync(full).isDirectory() ? readdirSync(full).length > 0 : true;
  if (remains) failures.push(`commercial path remains: ${relative}`);
}

function sourceFiles(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory).flatMap((name) => {
    const full = path.join(directory, name);
    if (full.endsWith("check-community-boundary.ts")) return [];
    return statSync(full).isDirectory() ? sourceFiles(full) : [full];
  });
}

const files = [
  ...sourceFiles(path.join(repoRoot, "apps/admin/app")),
  ...sourceFiles(path.join(repoRoot, "apps/admin/components")),
  ...sourceFiles(path.join(repoRoot, "apps/admin/lib")),
  path.join(repoRoot, "apps/admin/package.json"),
  path.join(repoRoot, "packages/db/prisma/schema.prisma"),
  path.join(repoRoot, ".env.example"),
].filter(existsSync);

for (const file of files) {
  const content = readFileSync(file, "utf8");
  for (const marker of forbiddenText) {
    if (content.includes(marker)) {
      failures.push(`${path.relative(repoRoot, file)} contains commercial marker ${marker}`);
    }
  }
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("Community boundary check passed.");
