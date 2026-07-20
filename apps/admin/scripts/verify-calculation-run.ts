/**
 * Full calculation verification against the e2e fixture.
 * Pins asOf to seed time and walks every calculation-bearing page/view.
 */
import { loadEnvConfig } from "@next/env";
import path from "node:path";

loadEnvConfig(path.join(__dirname, "../.."));

import { prisma } from "@usejunction/db";
import {
  DEFAULT_AS_OF,
  DEFAULT_ORG_SLUG,
  runCalculationVerification,
} from "./lib/run-calculation-verification";

async function main() {
  const outPath = path.join(__dirname, "calculation-verification-report.json");
  const { failed, report } = await runCalculationVerification({
    orgSlug: DEFAULT_ORG_SLUG,
    asOf: DEFAULT_AS_OF,
    writeReportPath: outPath,
  });

  console.log(
    JSON.stringify(
      {
        outPath,
        summary: report.summary,
        failureCount: failed.length,
        failures: failed.slice(0, 30),
      },
      null,
      2,
    ),
  );

  if (failed.length) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
