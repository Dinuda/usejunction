package probe

import (
	"context"
	"database/sql"
	"os"
	"path/filepath"
	"testing"
)

// Fixture shape matches a real Windows Cursor state.vscdb dump:
// ItemTable stores cursorAuth/* as BLOB values, and stripeMembershipType can
// lag the live subscription (observed as "free" while the account is Pro+).
func writeCursorStateFixture(t *testing.T, membership string) string {
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
	rows := [][2]string{
		{"cursorAuth/stripeMembershipType", membership},
		{"cursorAuth/cachedEmail", "y.dinuda@gmail.com"},
		{"cursorAuth/accessToken", "aaa.eyJzdWIiOiJ1c2VyLTEifQ.bbb"},
	}
	for _, row := range rows {
		if _, err := db.Exec(`INSERT INTO ItemTable (key, value) VALUES (?, ?)`, row[0], row[1]); err != nil {
			t.Fatal(err)
		}
	}
	return dbPath
}

func TestCursorStateDBReadsAuthKeysFromWindowsStylePath(t *testing.T) {
	dbPath := writeCursorStateFixture(t, "free")
	got, err := cursorStateDBValueAt(dbPath, "cursorAuth/stripeMembershipType")
	if err != nil {
		t.Fatal(err)
	}
	if got != "free" {
		t.Fatalf("membership = %q, want free (as in the Windows dump)", got)
	}
	email, err := cursorStateDBValueAt(dbPath, "cursorAuth/cachedEmail")
	if err != nil || email != "y.dinuda@gmail.com" {
		t.Fatalf("email = %q err=%v", email, err)
	}
	token, err := cursorStateDBValueAt(dbPath, "cursorAuth/accessToken")
	if err != nil || token == "" {
		t.Fatalf("token err=%v", err)
	}
}

func TestResolveCursorPlanIgnoresStaleLocalFree(t *testing.T) {
	dbPath := writeCursorStateFixture(t, "free")
	prev := cursorStateDBPathOverride
	cursorStateDBPathOverride = dbPath
	defer func() { cursorStateDBPathOverride = prev }()

	if local := cursorLocalMembershipType(); local != "free" {
		t.Fatalf("local = %q", local)
	}
	summary := &cursorUsageSummary{MembershipType: "pro_plus"}
	got := resolveCursorPlan(context.Background(), "", summary)
	if got != "pro_plus" {
		t.Fatalf("resolveCursorPlan = %q, want pro_plus (API must beat stale local free)", got)
	}
}

func TestResolveCursorPlanFallsBackToLocalWhenAPIEmpty(t *testing.T) {
	dbPath := writeCursorStateFixture(t, "pro_plus")
	prev := cursorStateDBPathOverride
	cursorStateDBPathOverride = dbPath
	defer func() { cursorStateDBPathOverride = prev }()

	ctx, cancel := context.WithCancel(context.Background())
	cancel() // force stripe/me lookups to fail closed so we exercise local fallback
	got := resolveCursorPlan(ctx, "", &cursorUsageSummary{})
	if got != "pro_plus" {
		t.Fatalf("resolveCursorPlan = %q, want local pro_plus fallback", got)
	}
}
