# Workflow Benchmark Lab

This is a local-only experiment for testing whether model × harness comparisons are useful inside real coding workflows. It is intentionally separate from the UseJunction admin app and database.

## Run

From the repository root:

```sh
pnpm --dir experiments/workflow-benchmark-lab run run
open experiments/workflow-benchmark-lab/reports/index.html
```

To analyze a recent window, pass the number of inclusive UTC days:

```sh
pnpm --dir experiments/workflow-benchmark-lab run run -- --days 30
```

The 60-day manual adjudication snapshot can be regenerated with:

```sh
pnpm --dir experiments/workflow-benchmark-lab run manual-report
open experiments/workflow-benchmark-lab/reports/manual-gold-set-60d.html
```

Generate the DataCurve-style chart from the reviewed labels with:

```sh
pnpm --dir experiments/workflow-benchmark-lab run manual-chart
open experiments/workflow-benchmark-lab/reports/manual-benchmark-chart-60d.html
```

The chart uses task completion as the primary rate and lets you switch to one-shot rate, strong verification, or failure rate. Error ranges are Wilson 95% intervals. The reviewed labels do not contain reliable model identity, so the chart intentionally compares harnesses only and keeps the automated model × harness report separate.

That report is a human-reviewed gold set, not an automated model judgment. It labels completion, requirements coverage, one-shot versus iterative work, verification strength, and explicit user outcome separately. Silence after an assistant response is recorded as `unclear`, not acceptance. The current snapshot is intentionally small and unbalanced; its purpose is to validate the rubric before scaling review or adding an LLM judge.

The generated report and summary are ignored by Git. The scan does not upload data or copy raw session files.

## Approved inputs

- Claude session JSONL under `~/.claude/projects/`
- Codex session JSONL under `~/.codex/sessions/` and `~/.codex/archived_sessions/`
- Cursor agent transcript JSONL under `~/.cursor/projects/**/agent-transcripts/`
- Aggregate cache JSON files under `~/.usejunction/cache/cost-usage/`

Credentials, settings, logs, lock files, databases, prompts, code, file contents, and full transcripts are excluded from the report. Task classification uses text in memory and emits only a fixed category label.

## Interpretation

The report is evidence-oriented. Missing metrics remain “Not measured”. A composite score is shown only for a group with at least five sessions, at least 50% metric coverage, and at least three measurable dimensions. The verdict is `Promising` only when at least two task-category comparison cells show meaningful score separation.

This is retrospective telemetry, not a controlled benchmark. It cannot establish causal model quality or replace standardized live tasks.
