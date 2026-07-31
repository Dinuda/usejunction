import { readFile, realpath, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";

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

const pageTracePaths = [
  ".next/server/app/(workspace)/dashboard/page.js.nft.json",
  ".next/server/app/(workspace)/team/page.js.nft.json",
  ".next/server/app/(workspace)/signals/page.js.nft.json",
];

const pageDataTracePaths = [
  ".next/server/app/api/app/dashboard/route.js.nft.json",
  ".next/server/app/api/app/team/route.js.nft.json",
  ".next/server/app/api/app/team/invites/route.js.nft.json",
  ".next/server/app/api/app/team/syncs/route.js.nft.json",
  ".next/server/app/api/app/signals/overview/route.js.nft.json",
];

const prismaApiTracePaths = [
  ".next/server/app/api/agent-releases/latest/route.js.nft.json",
  ".next/server/app/api/internal/agent-releases/promote/route.js.nft.json",
  ".next/server/app/auth/continue/route.js.nft.json",
  ".next/server/app/onboarding/page.js.nft.json",
];

const mib = 1024 * 1024;

async function readTrace(tracePath) {
  const absoluteTracePath = resolve(process.cwd(), tracePath);
  const manifest = JSON.parse(await readFile(absoluteTracePath, "utf8"));
  return {
    tracePath,
    files: manifest.files ?? [],
    absoluteFiles: [
      absoluteTracePath.slice(0, -".nft.json".length),
      ...(manifest.files ?? []).map((file) => resolve(dirname(absoluteTracePath), file)),
    ],
  };
}

async function tracedSize(traces) {
  const uniqueFiles = new Set();
  let bytes = 0;
  for (const trace of traces) {
    for (const file of trace.absoluteFiles) {
      try {
        const canonical = await realpath(file);
        if (uniqueFiles.has(canonical)) continue;
        const fileStat = await stat(canonical);
        if (!fileStat.isFile()) continue;
        uniqueFiles.add(canonical);
        bytes += fileStat.size;
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
      }
    }
  }
  return bytes;
}

const manifestPath = resolve(process.cwd(), ".next/routes-manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const builtRoutes = new Set((manifest.staticRoutes ?? []).map((route) => route.page));
const missing = requiredWorkspaceRoutes.filter((route) => !builtRoutes.has(route));

if (missing.length) {
  throw new Error(`Authenticated workspace routes missing from production build: ${missing.join(", ")}`);
}

const pageTraces = await Promise.all(pageTracePaths.map(readTrace));
for (const trace of pageTraces) {
  const prismaFiles = trace.files.filter((file) =>
    /(?:^|[/\\])(?:@prisma[+/\\]|\.prisma[/\\]|packages[/\\]db[/\\])/.test(file),
  );
  if (prismaFiles.length) {
    throw new Error(
      `Workspace page trace unexpectedly contains Prisma/database code (${trace.tracePath}): ${prismaFiles.slice(0, 5).join(", ")}`,
    );
  }
  const bytes = await tracedSize([trace]);
  if (bytes >= 5 * mib) {
    throw new Error(
      `Workspace page function exceeds 5 MiB (${trace.tracePath}: ${(bytes / mib).toFixed(2)} MiB)`,
    );
  }
}

const pageDataTraces = await Promise.all(pageDataTracePaths.map(readTrace));
const nativeEngines = pageDataTraces.flatMap((trace) =>
  trace.files.filter((file) => /libquery_engine|query-engine/i.test(file)),
);
if (nativeEngines.length) {
  throw new Error(
    `Rust Prisma query engines remain in page-data traces: ${nativeEngines.slice(0, 5).join(", ")}`,
  );
}

const pageDataBytes = await tracedSize(pageDataTraces);
if (pageDataBytes >= 15 * mib) {
  throw new Error(
    `Combined dashboard, Team, and Signals page-data traces exceed 15 MiB (${(pageDataBytes / mib).toFixed(2)} MiB)`,
  );
}

const prismaApiTraces = await Promise.all(prismaApiTracePaths.map(readTrace));
for (const trace of prismaApiTraces) {
  const wasmFiles = trace.files.filter((file) => file.endsWith(".wasm"));
  if (!wasmFiles.length) {
    throw new Error(
      `Prisma WASM query compiler missing from API trace (${trace.tracePath}). ` +
        "Ensure outputFileTracingIncludes covers /api/**/* in next.config.ts.",
    );
  }
}

console.log(
  `Client build assertions passed: ${requiredWorkspaceRoutes.length} routes, page traces below 5 MiB, page-data traces ${(pageDataBytes / mib).toFixed(2)} MiB with no native Prisma engines, Prisma WASM traced for agent-release APIs.`,
);
