import type { NextConfig } from "next";
import { loadEnvConfig } from "@next/env";
import path from "path";
import { securityHeaders } from "./lib/security-headers";

// Load monorepo root .env (pnpm dev runs from apps/admin; Prisma needs DATABASE_URL)
loadEnvConfig(path.join(__dirname, "../.."));

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../.."),
  outputFileTracingIncludes: {
    "/*": [
      "./node_modules/.pnpm/@prisma+client*/node_modules/.prisma/client/**/*",
      "./node_modules/.pnpm/@prisma+client*/node_modules/@prisma/client/**/*",
    ],
  },
  transpilePackages: ["@usejunction/db"],
  experimental: {
    optimizePackageImports: ["@lobehub/icons"],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders(process.env.NODE_ENV === "production"),
      },
    ];
  },
};

export default nextConfig;
