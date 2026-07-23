package scan

import (
	"database/sql"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/usejunction/agent/internal/types"
)

// Matches ItemTable BLOB layout from a real Windows Cursor state.vscdb.
func writeCursorDailyStatsFixture(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	dbPath := filepath.Join(dir, "AppData", "Roaming", "Cursor", "User", "globalStorage", "state.vscdb")
	if err := os.MkdirAll(filepath.Dir(dbPath), 0o755); err != nil {
		t.Fatal(err)
	}
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err := db.Exec(`CREATE TABLE ItemTable (key TEXT UNIQUE ON CONFLICT REPLACE, value BLOB)`); err != nil {
		t.Fatal(err)
	}
	payload := `{"date":"2026-07-19","tabSuggestedLines":12,"tabAcceptedLines":4,"composerSuggestedLines":30,"composerAcceptedLines":10}`
	if _, err := db.Exec(
		`INSERT INTO ItemTable (key, value) VALUES (?, ?)`,
		"aiCodeTracking.dailyStats.2026-07-19",
		payload,
	); err != nil {
		t.Fatal(err)
	}
	return dbPath
}

func TestScanCursorDailyStatsFromWindowsStyleStateDB(t *testing.T) {
	dbPath := writeCursorDailyStatsFixture(t)
	buckets := map[string]*types.DailyUsage{}
	if err := scanCursorDailyStatsAt(dbPath, buckets); err != nil {
		t.Fatal(err)
	}
	b := buckets["2026-07-19|ai-lines"]
	if b == nil {
		t.Fatalf("missing bucket, got %#v", buckets)
	}
	if b.SuggestedLines != 42 || b.AcceptedLines != 14 {
		t.Fatalf("lines suggested=%d accepted=%d", b.SuggestedLines, b.AcceptedLines)
	}
	if b.ToolName != "cursor" || b.Source != "cursor_local" {
		t.Fatalf("bucket = %#v", b)
	}
}

func TestParseCursorCommitDateGitFormat(t *testing.T) {
	cases := []struct {
		raw  string
		want string
	}{
		{raw: "Wed Jul 22 21:55:05 2026 +0530", want: "2026-07-22"},
		{raw: "Tue Jul 21 22:49:02 2026 +0530", want: "2026-07-21"},
		{raw: "2026-07-22", want: "2026-07-22"},
		{raw: "2026-07-22T21:55:05+05:30", want: "2026-07-22"},
		{raw: "Wed Jul 22", want: ""}, // incomplete — must not invent year 2001
		{raw: "", want: ""},
	}
	for _, tc := range cases {
		got := parseCursorCommitDate(tc.raw)
		if got != tc.want {
			t.Fatalf("parseCursorCommitDate(%q)=%q want %q", tc.raw, got, tc.want)
		}
	}
}

func TestCursorCommitDayFallsBackToScoredAt(t *testing.T) {
	// 2026-07-22 16:17:02 UTC ≈ 1784737822794 ms from earlier sample
	got := cursorCommitDay("Wed Jul 22", 1784737822794)
	if got != "2026-07-22" {
		t.Fatalf("fallback day=%q want 2026-07-22", got)
	}
	got = cursorCommitDay("Wed Jul 22 21:55:05 2026 +0530", 0)
	if got != "2026-07-22" {
		t.Fatalf("git date day=%q", got)
	}
}

func TestScanCursorScoredCommitsGitCommitDate(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("USERPROFILE", home)
	dbPath := filepath.Join(home, ".cursor", "ai-tracking", "ai-code-tracking.db")
	if err := os.MkdirAll(filepath.Dir(dbPath), 0o755); err != nil {
		t.Fatal(err)
	}
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	_, err = db.Exec(`
		CREATE TABLE scored_commits (
			commitDate TEXT,
			scoredAt INTEGER,
			composerLinesAdded INTEGER,
			composerLinesDeleted INTEGER,
			tabLinesAdded INTEGER,
			v2AiPercentage TEXT
		)
	`)
	if err != nil {
		t.Fatal(err)
	}
	_, err = db.Exec(`
		INSERT INTO scored_commits VALUES
		('Wed Jul 22 21:55:05 2026 +0530', 1784737822794, 100, 10, 5, '99.92'),
		('Wed Jul 22 17:05:45 2026 +0530', 1784720189338, 50, 5, 0, '100.00'),
		('Tue Jul 21 22:49:02 2026 +0530', 1784654437953, 40, 2, 0, '100.00')
	`)
	if err != nil {
		t.Fatal(err)
	}

	buckets := map[string]*types.DailyUsage{}
	if err := scanCursorScoredCommits(buckets); err != nil {
		t.Fatal(err)
	}
	jul22 := buckets["2026-07-22|commits"]
	if jul22 == nil || jul22.Commits != 2 {
		t.Fatalf("2026-07-22 commits bucket=%#v", jul22)
	}
	if jul22.AddedLines != 155 || jul22.DeletedLines != 15 {
		t.Fatalf("2026-07-22 lines added=%d deleted=%d", jul22.AddedLines, jul22.DeletedLines)
	}
	jul21 := buckets["2026-07-21|commits"]
	if jul21 == nil || jul21.Commits != 1 {
		t.Fatalf("2026-07-21 commits bucket=%#v", jul21)
	}
	// Must not bucket under broken substr keys.
	for key := range buckets {
		if strings.HasPrefix(key, "Wed ") || strings.HasPrefix(key, "Tue ") || strings.HasPrefix(key, "2001-") {
			t.Fatalf("invalid day key %q", key)
		}
	}
}
