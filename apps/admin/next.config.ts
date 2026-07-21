import type { NextConfig } from "next";
import { loadEnvConfig } from "@next/env";
import path from "path";
import { assertSecureProductionEnv } from "./lib/security/env-guard";

// Load monorepo root .env (pnpm dev runs from apps/admin; Prisma needs DATABASE_URL)
loadEnvConfig(path.join(__dirname, "../.."));
assertSecureProductionEnv();

const nextConfig: NextConfig = {
  poweredByHeader: false,
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
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.usejunction.dev" }],
        destination: "https://usejunction.dev/:path*",
        permanent: true,
      },
      {
        source: "/:path*",
        has: [{ type: "host", value: "usejunction.com" }],
        destination: "https://usejunction.dev/:path*",
        permanent: true,
      },
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.usejunction.com" }],
        destination: "https://usejunction.dev/:path*",
        permanent: true,
      },
    ];
  },
  async headers() {
    const commonHeaders = [
      { key: "Content-Security-Policy", value: `default-src 'self'; script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'"}; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https: http://127.0.0.1:* http://localhost:*; frame-ancestors 'none'; base-uri 'self'; form-action 'self'` },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
      ...(process.env.NODE_ENV === "production" ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }] : []),
    ];
    return [
      {
        source: "/:path*",
        headers: [...commonHeaders, { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" }],
      },
      {
        source: "/:tokenPath(join|i|connect-invite|reset-password|verify)/:path*",
        headers: [...commonHeaders, { key: "Referrer-Policy", value: "no-referrer" }],
      },
      {
        source: "/api/:tokenPath(join|i|connect-invite|auth)/:path*",
        headers: [...commonHeaders, { key: "Referrer-Policy", value: "no-referrer" }],
      },
    ];
  },
};

export default nextConfig;
