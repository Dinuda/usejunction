package workextract

import (
	"database/sql"
	"os"
	"path/filepath"
	"testing"
)

// Fixture mirrors the migrated Windows Cursor state.vscdb schema from a real
// dump: composerHeaders table + ItemTable, with tableGateEnabled / migratedToTable.
func writeMigratedComposerHeadersFixture(t *testing.T) string {
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
	if _, err := db.Exec(`
		CREATE TABLE composerHeaders (
			composerId TEXT PRIMARY KEY,
			workspaceId TEXT,
			createdAt INTEGER,
			lastUpdatedAt INTEGER,
			isArchived INTEGER,
			isSubagent INTEGER,
			recency INTEGER,
			checkpointAt INTEGER,
			value TEXT
		)`); err != nil {
		t.Fatal(err)
	}
	// Markers from the real dump.
	for _, key := range []string{
		"composer.composerHeaders.tableGateEnabled",
		"composer.composerHeaders.migratedToTable",
	} {
		if _, err := db.Exec(`INSERT INTO ItemTable (key, value) VALUES (?, ?)`, key, "true"); err != nil {
			t.Fatal(err)
		}
	}
	// Legacy ItemTable blob intentionally empty / missing so table path must win.
	headerJSON := `{
		"type":"head",
		"composerId":"9d342849-ab25-456d-949d-d988acd62d2f",
		"name":"General chat",
		"subtitle":"I'm doing well, thanks for asking! Ready to help whenever yo…",
		"unifiedMode":"agent",
		"forceMode":"edit",
		"createdAt":1784465836844,
		"lastUpdatedAt":1784465837267,
		"isDraft":false,
		"isArchived":false,
		"totalLinesAdded":0,
		"totalLinesRemoved":0,
		"filesChangedCount":0,
		"workspaceIdentifier":{"id":"empty-window"},
		"agentLocation":{"type":"local","environment":{"id":"empty-window"},"status":"active"}
	}`
	if _, err := db.Exec(`
		INSERT INTO composerHeaders (
			composerId, workspaceId, createdAt, lastUpdatedAt, isArchived, isSubagent, recency, value
		) VALUES (?, ?, ?, ?, 0, 0, ?, ?)`,
		"9d342849-ab25-456d-949d-d988acd62d2f",
		"empty-window",
		1784465836844,
		1784465837267,
		1784465837267,
		headerJSON,
	); err != nil {
		t.Fatal(err)
	}
	return dbPath
}

func writeLegacyComposerHeadersFixture(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	dbPath := filepath.Join(dir, "state.vscdb")
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err := db.Exec(`CREATE TABLE ItemTable (key TEXT UNIQUE ON CONFLICT REPLACE, value BLOB)`); err != nil {
		t.Fatal(err)
	}
	payload := `{
		"allComposers": [
			{"composerId":"abc-123","name":"Legacy header","subtitle":"Edited cursor.go","unifiedMode":"agent","createdAt":1783412593102,"lastUpdatedAt":1783412593310}
		]
	}`
	if _, err := db.Exec(`INSERT INTO ItemTable (key, value) VALUES (?, ?)`, "composer.composerHeaders", payload); err != nil {
		t.Fatal(err)
	}
	return dbPath
}

func TestExtractComposerHeadersFromMigratedWindowsTable(t *testing.T) {
	dbPath := writeMigratedComposerHeadersFixture(t)
	sessions := extractCursorComposerHeadersAt(dbPath, 10)
	if len(sessions) != 1 {
		t.Fatalf("sessions = %#v", sessions)
	}
	if sessions[0].Title != "General chat" {
		t.Fatalf("title = %q", sessions[0].Title)
	}
	if sessions[0].Mode != "agent" {
		t.Fatalf("mode = %q", sessions[0].Mode)
	}
	if sessions[0].LocalID != "cursor:9d342849-ab25-456d-949d-d988acd62d2f" {
		t.Fatalf("id = %q", sessions[0].LocalID)
	}
	if sessions[0].Source != "headers" {
		t.Fatalf("source = %q", sessions[0].Source)
	}
}

func TestExtractComposerHeadersFallsBackToItemTable(t *testing.T) {
	dbPath := writeLegacyComposerHeadersFixture(t)
	sessions := extractCursorComposerHeadersAt(dbPath, 10)
	if len(sessions) != 1 || sessions[0].Title != "Legacy header" {
		t.Fatalf("sessions = %#v", sessions)
	}
}
