import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

type Label = {
  id: string;
  harness: "Codex" | "Cursor" | "Claude Code";
  category: string;
  completion: "complete" | "partial" | "failed" | "non_task";
  oneShot: "yes" | "no" | "unknown";
  verification: "strong" | "moderate" | "none";
  outcome: "accepted" | "rejected" | "unclear";
  requirements: "full" | "partial" | "not_applicable" | "unknown";
  confidence: "high" | "medium" | "low";
};

// Snapshot of the manually adjudicated 60-day sample. IDs are local snapshot IDs;
// no source paths, prompts, code, or transcript text are persisted.
const labels: Label[] = [
  ["Codex", "feature", "partial", "unknown", "none", "unclear", "partial", "high"],
  ["Codex", "feature", "partial", "unknown", "none", "unclear", "partial", "high"],
  ["Codex", "feature", "complete", "no", "moderate", "unclear", "full", "high"],
  ["Codex", "feature", "complete", "yes", "strong", "unclear", "full", "high"],
  ["Codex", "bug fix", "complete", "no", "strong", "unclear", "full", "high"],
  ["Codex", "bug fix", "complete", "yes", "moderate", "unclear", "not_applicable", "high"],
  ["Codex", "bug fix", "complete", "no", "strong", "unclear", "full", "medium"],
  ["Codex", "bug fix", "complete", "no", "strong", "unclear", "full", "high"],
  ["Codex", "refactor", "complete", "no", "strong", "unclear", "full", "high"],
  ["Codex", "refactor", "complete", "no", "moderate", "unclear", "full", "medium"],
  ["Codex", "testing/debugging", "complete", "yes", "moderate", "unclear", "full", "high"],
  ["Codex", "testing/debugging", "complete", "yes", "moderate", "unclear", "full", "high"],
  ["Codex", "testing/debugging", "complete", "yes", "moderate", "unclear", "full", "high"],
  ["Codex", "testing/debugging", "complete", "no", "strong", "unclear", "full", "high"],
  ["Codex", "docs/configuration", "complete", "no", "strong", "unclear", "full", "high"],
  ["Codex", "docs/configuration", "complete", "yes", "moderate", "unclear", "full", "high"],
  ["Codex", "docs/configuration", "complete", "yes", "none", "unclear", "not_applicable", "high"],
  ["Codex", "docs/configuration", "complete", "no", "strong", "unclear", "full", "high"],
  ["Codex", "unknown", "partial", "no", "strong", "unclear", "partial", "high"],
  ["Codex", "unknown", "complete", "yes", "moderate", "unclear", "full", "high"],
  ["Codex", "unknown", "partial", "no", "strong", "unclear", "partial", "high"],
  ["Codex", "unknown", "complete", "yes", "moderate", "unclear", "full", "medium"],
  ["Cursor", "feature", "partial", "no", "none", "unclear", "partial", "medium"],
  ["Cursor", "feature", "complete", "no", "strong", "unclear", "full", "high"],
  ["Cursor", "feature", "complete", "yes", "none", "unclear", "full", "high"],
  ["Cursor", "feature", "complete", "yes", "moderate", "unclear", "full", "high"],
  ["Cursor", "bug fix", "complete", "no", "strong", "unclear", "full", "high"],
  ["Cursor", "bug fix", "complete", "yes", "moderate", "unclear", "full", "high"],
  ["Cursor", "bug fix", "complete", "yes", "moderate", "unclear", "full", "high"],
  ["Cursor", "bug fix", "complete", "yes", "strong", "unclear", "full", "high"],
  ["Cursor", "refactor", "complete", "yes", "moderate", "unclear", "full", "high"],
  ["Cursor", "refactor", "complete", "no", "strong", "unclear", "full", "high"],
  ["Cursor", "refactor", "complete", "yes", "moderate", "unclear", "full", "high"],
  ["Cursor", "refactor", "complete", "yes", "moderate", "unclear", "full", "high"],
  ["Cursor", "refactor", "complete", "yes", "moderate", "unclear", "full", "high"],
  ["Cursor", "testing/debugging", "complete", "no", "strong", "unclear", "full", "high"],
  ["Cursor", "testing/debugging", "complete", "yes", "moderate", "unclear", "full", "high"],
  ["Cursor", "testing/debugging", "complete", "no", "strong", "unclear", "full", "high"],
  ["Cursor", "testing/debugging", "complete", "no", "strong", "unclear", "full", "high"],
  ["Cursor", "docs/configuration", "complete", "yes", "moderate", "unclear", "full", "high"],
  ["Cursor", "docs/configuration", "complete", "yes", "moderate", "unclear", "full", "high"],
  ["Cursor", "docs/configuration", "partial", "no", "moderate", "unclear", "partial", "high"],
  ["Cursor", "docs/configuration", "failed", "no", "none", "rejected", "partial", "high"],
  ["Cursor", "unknown", "complete", "yes", "moderate", "unclear", "full", "high"],
  ["Cursor", "unknown", "complete", "no", "moderate", "unclear", "full", "high"],
  ["Cursor", "unknown", "complete", "yes", "moderate", "unclear", "full", "high"],
  ["Cursor", "unknown", "complete", "yes", "moderate", "unclear", "full", "high"],
  ["Claude Code", "unknown", "non_task", "unknown", "none", "unclear", "not_applicable", "high"],
  ["Cursor", "unknown", "complete", "yes", "moderate", "unclear", "full", "high"],
  ["Cursor", "testing/debugging", "failed", "no", "none", "unclear", "partial", "high"],
  ["Cursor", "unknown", "complete", "no", "moderate", "unclear", "full", "medium"],
].map((row, index) => ({ id: `manual-${String(index + 1).padStart(2, "0")}`, harness: row[0] as Label["harness"], category: row[1], completion: row[2] as Label["completion"], oneShot: row[3] as Label["oneShot"], verification: row[4] as Label["verification"], outcome: row[5] as Label["outcome"], requirements: row[6] as Label["requirements"], confidence: row[7] as Label["confidence"] }));

function esc(value: string) { return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"); }
function count(field: keyof Label, value: string) { return labels.filter((label) => label[field] === value).length; }

function rows() {
  return labels.map((label) => `<tr><td>${label.id}</td><td>${label.harness}</td><td>${label.category}</td><td class="${label.completion}">${label.completion}</td><td>${label.oneShot}</td><td>${label.verification}</td><td>${label.outcome}</td><td>${label.requirements}</td><td>${label.confidence}</td></tr>`).join("");
}

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Manual Gold Set — Workflow Benchmark Lab</title><style>
:root{color-scheme:dark;--bg:#0b0d10;--panel:#14191f;--line:#2a333d;--text:#edf2f7;--muted:#9aa6b2;--accent:#d9ff4f;--red:#ff9292;--yellow:#ffd479}*{box-sizing:border-box}body{margin:0;background:#0b0d10;color:var(--text);font:14px/1.5 system-ui,sans-serif}main{max-width:1400px;margin:auto;padding:40px 24px 80px}h1{font-size:44px;letter-spacing:-.05em;margin:8px 0}h2{margin-top:30px}.lede{color:var(--muted);max-width:900px;font-size:16px}.eyebrow{color:var(--accent);font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase}.grid{display:grid;grid-template-columns:repeat(6,1fr);gap:12px;margin:24px 0}.card,.panel{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:16px}.card label,.small{display:block;color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.08em}.card strong{display:block;font-size:26px;margin-top:4px}.panel{overflow:auto}.callout{border-color:#657b24;background:#172017}.callout strong{color:var(--accent)}table{width:100%;border-collapse:collapse;min-width:900px}th,td{padding:9px 8px;border-bottom:1px solid var(--line);text-align:left}th{color:var(--muted);font-size:11px;text-transform:uppercase}.complete{color:var(--accent)}.partial{color:var(--yellow)}.failed{color:var(--red)}.non_task{color:var(--muted)}li{margin:8px 0;color:var(--muted)}@media(max-width:900px){.grid{grid-template-columns:repeat(3,1fr)}}@media(max-width:600px){main{padding:24px 14px}.grid{grid-template-columns:repeat(2,1fr)}}
</style></head><body><main><div class="eyebrow">UseJunction / manual adjudication</div><h1>60-Day Gold Set Review</h1><p class="lede">A manually reviewed snapshot of ${labels.length} real sessions from 2026-06-05 through 2026-08-03. The reviewer judged the conversation outcome, not the model name: whether the requested work was completed, whether the requirements were covered, whether the work was one-shot or iterative, how strong the verification evidence was, and whether a user outcome signal existed.</p>
<section class="grid"><div class="card"><label>Sessions reviewed</label><strong>${labels.length}</strong></div><div class="card"><label>Complete</label><strong>${count("completion", "complete")}</strong></div><div class="card"><label>Partial</label><strong>${count("completion", "partial")}</strong></div><div class="card"><label>Failed</label><strong>${count("completion", "failed")}</strong></div><div class="card"><label>One-shot</label><strong>${count("oneShot", "yes")}</strong></div><div class="card"><label>Strong verification</label><strong>${count("verification", "strong")}</strong></div></section>
<section class="panel callout"><strong>What this proves:</strong> completion evidence and user satisfaction are different variables. The sample contains many strong implementation/test completions, but almost no explicit post-completion user acceptance. A skeptical benchmark must report those separately.</section>
<h2>Manual conclusions</h2><section class="panel"><ul><li>Complex implementation sessions were generally iterative, with correction loops and strong test/build evidence.</li><li>Research, architecture mapping, and documentation sessions were more often one-shot and had moderate evidence: the answer itself was the deliverable.</li><li>Several sessions were partial because the assistant proposed a plan, stopped early, or completed only part of a multi-step request.</li><li>At least two sessions were failures from a workflow perspective: one ignored an explicit stop request, and another ended on a different question than the original task.</li><li>User satisfaction is mostly <strong>unclear</strong> because the conversation ended immediately after the assistant response. It must not be inferred from “implemented” or “tests passed.”</li><li>These labels are not a public leaderboard. The set is a methodology pilot and is not balanced enough to compare harnesses causally.</li></ul></section>
<h2>Adjudication rubric</h2><section class="panel"><ul><li><strong>Complete:</strong> the final response addressed the requested deliverable with no known unresolved requirement.</li><li><strong>Partial:</strong> useful progress or analysis existed, but the request was unfinished, blocked, or explicitly stopped.</li><li><strong>Failed:</strong> the final behavior contradicted the user’s request or drifted to a different task.</li><li><strong>One-shot:</strong> no substantive user correction/retry was needed before the final answer.</li><li><strong>Strong verification:</strong> tests, builds, live checks, or measurable artifacts supported the claim.</li><li><strong>User outcome:</strong> only explicit post-response acceptance/rejection counts; absent follow-up is unclear.</li></ul></section>
<h2>Session-level audit table</h2><section class="panel"><table><thead><tr><th>ID</th><th>Harness</th><th>Task</th><th>Completion</th><th>One-shot</th><th>Verification</th><th>User outcome</th><th>Requirements</th><th>Confidence</th></tr></thead><tbody>${rows()}</tbody></table></section>
<h2>How to show this to skeptical developers</h2><section class="panel"><ol><li>Show the rubric and all denominators before showing scores.</li><li>Show matched task traces: same task type, repository class, and comparable complexity.</li><li>Separate task completion, user satisfaction, efficiency, and verification into independent columns.</li><li>Publish failed and partial examples alongside successful ones.</li><li>Use an LLM judge only after this human-reviewed gold set exists, then report agreement against it.</li></ol><p class="small">This report contains no raw prompts, code, file paths, credentials, or transcripts. The manual IDs are local snapshot identifiers.</p></section>
</main></body></html>`;

const root = join(dirname(new URL(import.meta.url).pathname), "..");
await mkdir(join(root, "reports"), { recursive: true });
await writeFile(join(root, "reports", "manual-gold-set-60d.html"), html, "utf8");
await writeFile(join(root, "reports", "manual-gold-set-60d.json"), JSON.stringify({ window: { from: "2026-06-05", to: "2026-08-03" }, labels }, null, 2), "utf8");
console.log(`Manual gold-set report generated: ${join(root, "reports", "manual-gold-set-60d.html")}`);
console.log(`Reviewed ${labels.length}: complete=${count("completion", "complete")}, partial=${count("completion", "partial")}, failed=${count("completion", "failed")}, non-task=${count("completion", "non_task")}`);
