import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { discoverSourceFiles } from "../src/sources/files.js";
import { readSessionFile, readUsageCache } from "../src/sources/readers.js";
import { buildReport } from "../src/metrics/analyze.js";
import { renderReport } from "../src/render/report.js";

const root = dirname(new URL(import.meta.url).pathname).replace(/\/scripts$/, "");
const reportDir = join(root, "reports");

async function main() {
  const daysFlag = process.argv.indexOf("--days");
  const requestedDays = daysFlag >= 0 ? Number(process.argv[daysFlag + 1]) : null;
  const days = requestedDays && Number.isInteger(requestedDays) && requestedDays > 0 ? requestedDays : null;
  const now = new Date();
  const from = days === null ? null : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (days - 1)));
  const sourceFiles = await discoverSourceFiles();
  const sessions = [];
  const usage = [];
  for (const source of sourceFiles) {
    if (source.kind === "session") {
      const session = await readSessionFile(source);
      if (session && (!from || session.date >= from.toISOString().slice(0, 10))) sessions.push(session);
    } else {
      const records = await readUsageCache(source);
      usage.push(...records.filter((record) => !from || record.date >= from.toISOString().slice(0, 10)));
    }
  }
  const report = buildReport(sessions, usage, sourceFiles);
  await mkdir(reportDir, { recursive: true });
  await writeFile(join(reportDir, "index.html"), renderReport(report), "utf8");
  await writeFile(join(reportDir, "summary.json"), JSON.stringify(report, null, 2), "utf8");
  console.log(`Workflow Benchmark Lab\nWindow: ${from ? `${from.toISOString().slice(0, 10)} through ${now.toISOString().slice(0, 10)}` : "all available data"}\nSources: ${sourceFiles.length}\nSessions: ${sessions.length}\nUsage records: ${usage.length}\nVerdict: ${report.verdict.label}\nReport: ${join(reportDir, "index.html")}`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
