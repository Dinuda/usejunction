import type { NextConfig } from "next";
import path from "path";

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
};

export default nextConfig;
