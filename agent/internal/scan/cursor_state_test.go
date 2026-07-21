package scan

import (
	"database/sql"
	"os"
	"path/filepath"
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
