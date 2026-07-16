import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname),
    },
  },
  test: {
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    exclude: ["node_modules", ".next", "e2e"],
    passWithNoTests: false,
    pool: "threads",
    maxWorkers: 1,
    clearMocks: true,
    restoreMocks: true,
    unstubGlobals: true,
    unstubEnvs: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      include: [
        "lib/billing/**/*.ts",
        "lib/metrics/**/*.ts",
        "lib/quotas/**/*.ts",
        "lib/signals/policies/**/*.ts",
        "lib/signals/queries/windows.ts",
        "lib/dashboard/period-prefs.ts",
      ],
      exclude: ["lib/**/*.d.ts"],
      thresholds: {
        lines: 0,
        functions: 0,
        statements: 0,
        branches: 0,
        "lib/metrics/source-priority.ts": {
          lines: 90,
          functions: 90,
          statements: 90,
          branches: 85,
        },
        "lib/metrics/cost-summary.ts": {
          lines: 90,
          functions: 90,
          statements: 90,
          branches: 85,
        },
        "lib/metrics/estimate-cost.ts": {
          lines: 90,
          functions: 90,
          statements: 90,
          branches: 85,
        },
        "lib/billing/cycles.ts": {
          lines: 90,
          functions: 90,
          statements: 90,
          branches: 85,
        },
        "lib/quotas/display.ts": {
          lines: 90,
          functions: 90,
          statements: 90,
          branches: 85,
        },
        "lib/signals/policies/rollup.ts": {
          lines: 90,
          functions: 90,
          statements: 90,
          branches: 85,
        },
        "lib/signals/queries/windows.ts": {
          lines: 90,
          functions: 90,
          statements: 90,
          branches: 85,
        },
      },
    },
  },
});
