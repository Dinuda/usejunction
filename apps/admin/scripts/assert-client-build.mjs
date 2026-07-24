import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const requiredWorkspaceRoutes = [
  "/activity",
  "/dashboard",
  "/settings",
  "/signals",
  "/signals/activity",
  "/signals/settings",
  "/team",
  "/tools",
];

const manifestPath = resolve(process.cwd(), ".next/routes-manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const builtRoutes = new Set((manifest.staticRoutes ?? []).map((route) => route.page));
const missing = requiredWorkspaceRoutes.filter((route) => !builtRoutes.has(route));

if (missing.length) {
  throw new Error(`Authenticated workspace routes missing from production build: ${missing.join(", ")}`);
}

console.log(
  `Client build route assertion passed (${requiredWorkspaceRoutes.length} workspace application routes present).`,
);
