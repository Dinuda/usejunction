package scan

import (
	"database/sql"
	"os"
	"path/filepath"
	"testing"

	"github.com/usejunction/agent/internal/types"
	_ "modernc.org/sqlite"
)

func writeOpenCodeFixture(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	dbPath := filepath.Join(dir, "opencode.db")
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	_, err = db.Exec(`
		CREATE TABLE project (
			id text PRIMARY KEY,
			worktree text NOT NULL,
			vcs text,
			name text,
			sandboxes text NOT NULL DEFAULT '[]',
			time_created integer NOT NULL,
			time_updated integer NOT NULL
		);
		CREATE TABLE session (
			id text PRIMARY KEY,
			project_id text NOT NULL,
			slug text NOT NULL,
			directory text NOT NULL,
			title text NOT NULL,
			version text NOT NULL,
			summary_additions integer,
			summary_deletions integer,
			summary_files integer,
			time_created integer NOT NULL,
			time_updated integer NOT NULL,
			model text,
			cost real DEFAULT 0 NOT NULL,
			tokens_input integer DEFAULT 0 NOT NULL,
			tokens_output integer DEFAULT 0 NOT NULL,
			tokens_reasoning integer DEFAULT 0 NOT NULL,
			tokens_cache_read integer DEFAULT 0 NOT NULL,
			tokens_cache_write integer DEFAULT 0 NOT NULL
		);
		CREATE TABLE message (
			id text PRIMARY KEY,
			session_id text NOT NULL,
			time_created integer NOT NULL,
			time_updated integer NOT NULL,
			data text NOT NULL
		);
	`)
	if err != nil {
		t.Fatal(err)
	}

	// Recent day within UsageLookbackDays (use fixed ms for 2026-07-01 12:00 UTC).
	dayMs := int64(1782907200000)
	_, err = db.Exec(`INSERT INTO project (id, worktree, sandboxes, time_created, time_updated) VALUES (?, ?, '[]', ?, ?)`,
		"proj-1", "/tmp/demo", dayMs, dayMs)
	if err != nil {
		t.Fatal(err)
	}

	// Session rollup intentionally undercounts (session tokens < sum of messages).
	_, err = db.Exec(`
		INSERT INTO session (
			id, project_id, slug, directory, title, version,
			summary_additions, summary_deletions, summary_files,
			time_created, time_updated, model, cost,
			tokens_input, tokens_output, tokens_reasoning, tokens_cache_read, tokens_cache_write
		) VALUES (?, ?, 'slug', '/tmp/demo', 'multi', '1',
			120, 30, 2, ?, ?, '{"id":"big-pickle","providerID":"opencode"}', 0,
			1000, 50, 0, 0, 0)
	`, "ses-multi", "proj-1", dayMs, dayMs)
	if err != nil {
		t.Fatal(err)
	}

	msgs := []struct {
		id, data string
		ts       int64
	}{
		{
			"msg-1",
			`{"role":"assistant","time":{"created":1782907200000},"modelID":"big-pickle","providerID":"opencode","tokens":{"input":1000,"output":50,"reasoning":10,"cache":{"read":200,"write":0}},"cost":0}`,
			dayMs,
		},
		{
			"msg-2",
			`{"role":"assistant","time":{"created":1782907300000},"modelID":"kimi-k2.7-code","providerID":"opencode-go","tokens":{"input":5000,"output":200,"reasoning":0,"cache":{"read":1000,"write":0}},"cost":0.42}`,
			dayMs + 100000,
		},
		{
			"msg-3",
			`{"role":"user","time":{"created":1782907400000},"tokens":{"input":1,"output":0}}`,
			dayMs + 200000,
		},
	}
	for _, m := range msgs {
		_, err = db.Exec(
			`INSERT INTO message (id, session_id, time_created, time_updated, data) VALUES (?, ?, ?, ?, ?)`,
			m.id, "ses-multi", m.ts, m.ts, m.data,
		)
		if err != nil {
			t.Fatal(err)
		}
	}
	return dbPath
}

func TestScanOpenCodeMessageLevelNotSessionRollup(t *testing.T) {
	dbPath := writeOpenCodeFixture(t)
	prev := opencodeDBPathOverride
	opencodeDBPathOverride = dbPath
	defer func() { opencodeDBPathOverride = prev }()

	rows, err := ScanOpenCode(true)
	if err != nil {
		t.Fatal(err)
	}

	byModel := map[string]types.DailyUsage{}
	var local *types.DailyUsage
	for _, row := range rows {
		if row.Source == opencodeLocalSource {
			cp := row
			local = &cp
			continue
		}
		byModel[row.Model] = row
	}

	pickle, ok := byModel["opencode/big-pickle"]
	if !ok {
		t.Fatalf("missing big-pickle row: %#v", rows)
	}
	if pickle.InputTokens != 1000 || pickle.OutputTokens != 50 || pickle.ReasoningTokens != 10 || pickle.CacheReadTokens != 200 {
		t.Fatalf("pickle tokens = %+v", pickle)
	}
	if pickle.Source != opencodeUsageSource || pickle.MetricKind != types.MetricKindUsage {
		t.Fatalf("pickle provenance = %+v", pickle)
	}
	if pickle.CostKind != types.CostKindEstimatedAPI || pickle.EstimatedCost <= 0 {
		t.Fatalf("zero-cost should estimate: %+v", pickle)
	}
	if pickle.Requests != 1 {
		t.Fatalf("pickle requests = %d", pickle.Requests)
	}

	kimi, ok := byModel["opencode-go/kimi-k2.7-code"]
	if !ok {
		t.Fatalf("missing kimi row: %#v", rows)
	}
	if kimi.InputTokens != 5000 || kimi.OutputTokens != 200 {
		t.Fatalf("kimi tokens = %+v", kimi)
	}
	if kimi.EstimatedCost < 0.41 || kimi.EstimatedCost > 0.43 {
		t.Fatalf("kimi cost = %v want ~0.42", kimi.EstimatedCost)
	}
	if kimi.CostKind != types.CostKindActualSpend {
		t.Fatalf("kimi cost kind = %q", kimi.CostKind)
	}

	// Message sum (6000) must beat undercounted session rollup (1000).
	totalIn := pickle.InputTokens + kimi.InputTokens
	if totalIn != 6000 {
		t.Fatalf("total input = %d want 6000 (message-level)", totalIn)
	}

	if local == nil {
		t.Fatal("expected productivity row from session summary")
	}
	if local.AddedLines != 120 || local.DeletedLines != 30 {
		t.Fatalf("local churn = %+v", local)
	}
	if local.MetricKind != types.MetricKindProductivity || local.Source != opencodeLocalSource {
		t.Fatalf("local provenance = %+v", local)
	}
}

func TestScanOpenCodeMissingDB(t *testing.T) {
	prev := opencodeDBPathOverride
	opencodeDBPathOverride = filepath.Join(t.TempDir(), "missing.db")
	defer func() { opencodeDBPathOverride = prev }()

	rows, err := ScanOpenCode(true)
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 0 {
		t.Fatalf("missing db rows = %#v", rows)
	}
}

func TestScanOpenCodeEmptyDB(t *testing.T) {
	dir := t.TempDir()
	dbPath := filepath.Join(dir, "opencode.db")
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatal(err)
	}
	_, err = db.Exec(`
		CREATE TABLE session (
			id text PRIMARY KEY, project_id text NOT NULL, slug text NOT NULL,
			directory text NOT NULL, title text NOT NULL, version text NOT NULL,
			time_created integer NOT NULL, time_updated integer NOT NULL,
			summary_additions integer, summary_deletions integer
		);
		CREATE TABLE message (
			id text PRIMARY KEY, session_id text NOT NULL,
			time_created integer NOT NULL, time_updated integer NOT NULL, data text NOT NULL
		);
	`)
	if err != nil {
		t.Fatal(err)
	}
	_ = db.Close()

	prev := opencodeDBPathOverride
	opencodeDBPathOverride = dbPath
	defer func() { opencodeDBPathOverride = prev }()

	rows, err := ScanOpenCode(true)
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 0 {
		t.Fatalf("empty db rows = %#v", rows)
	}
}

func TestScanOpenCodeLiveLocalDB(t *testing.T) {
	if os.Getenv("UJ_LIVE_OPENCODE") != "1" {
		t.Skip("set UJ_LIVE_OPENCODE=1 to run against local OpenCode state")
	}
	prev := opencodeDBPathOverride
	opencodeDBPathOverride = ""
	defer func() { opencodeDBPathOverride = prev }()

	path := opencodeDBPath()
	if path == "" {
		t.Skip("opencode.db not present on this machine")
	}

	rows, err := ScanOpenCode(true)
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) == 0 {
		t.Fatal("expected usage rows from live opencode.db")
	}
	var usageRows, localRows int
	var totalIn int
	var hasCost bool
	for _, row := range rows {
		if row.ToolName != "opencode" {
			t.Fatalf("unexpected tool %q", row.ToolName)
		}
		switch row.Source {
		case opencodeUsageSource:
			usageRows++
			totalIn += row.InputTokens
			if row.EstimatedCost > 0 {
				hasCost = true
			}
		case opencodeLocalSource:
			localRows++
		default:
			t.Fatalf("unexpected source %q", row.Source)
		}
	}
	if usageRows == 0 {
		t.Fatal("expected opencode_usage rows")
	}
	if totalIn == 0 {
		t.Fatal("expected non-zero input tokens")
	}
	t.Logf("live opencode: usage=%d local=%d inputTokens=%d hasCost=%v", usageRows, localRows, totalIn, hasCost)
}

func TestOpenCodeModelKey(t *testing.T) {
	if got := opencodeModelKey("opencode", "big-pickle"); got != "opencode/big-pickle" {
		t.Fatalf("got %q", got)
	}
	if got := opencodeModelKey("", "solo"); got != "solo" {
		t.Fatalf("got %q", got)
	}
	if got := opencodeModelKey("", ""); got != "opencode" {
		t.Fatalf("got %q", got)
	}
}
