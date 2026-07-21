package sqlitedb

import (
	"database/sql"
	"os"
	"path/filepath"
	"testing"
)

func TestOpenReadonlyWindowsStylePath(t *testing.T) {
	dir := t.TempDir()
	// Simulate a Windows-like absolute path shape under the temp dir.
	// On every OS, nested paths with spaces must still open.
	nested := filepath.Join(dir, "AppData", "Roaming", "Cursor", "User", "globalStorage")
	if err := os.MkdirAll(nested, 0o755); err != nil {
		t.Fatal(err)
	}
	dbPath := filepath.Join(nested, "state.vscdb")

	w, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := w.Exec(`CREATE TABLE ItemTable (key TEXT UNIQUE, value BLOB)`); err != nil {
		t.Fatal(err)
	}
	if _, err := w.Exec(`INSERT INTO ItemTable (key, value) VALUES (?, ?)`, "cursorAuth/stripeMembershipType", "free"); err != nil {
		t.Fatal(err)
	}
	w.Close()

	ro, err := OpenReadonly(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	defer ro.Close()
	var got string
	if err := ro.QueryRow(`SELECT value FROM ItemTable WHERE key = ?`, "cursorAuth/stripeMembershipType").Scan(&got); err != nil {
		t.Fatal(err)
	}
	if got != "free" {
		t.Fatalf("value = %q", got)
	}
}
