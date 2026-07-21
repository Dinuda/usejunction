import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const requiredStaticRoutes = [
  "/activity",
  "/dashboard",
  "/settings",
  "/signals",
  "/signals/activity",
  "/signals/settings",
  "/team",
  "/tools",
];

const manifestPath = resolve(process.cwd(), ".next/prerender-manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const prerendered = new Set(Object.keys(manifest.routes ?? {}));
const missing = requiredStaticRoutes.filter((route) => !prerendered.has(route));

if (missing.length) {
  throw new Error(`Authenticated UI routes regressed to request-time rendering: ${missing.join(", ")}`);
}

console.log(`Client-rendered route assertion passed (${requiredStaticRoutes.length} prerendered application routes).`);
