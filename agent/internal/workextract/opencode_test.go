package workextract

import (
	"database/sql"
	"os"
	"path/filepath"
	"testing"

	"github.com/usejunction/agent/internal/scan"
	_ "modernc.org/sqlite"
)

func writeOpenCodeWorkFixture(t *testing.T) string {
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
			model text
		);
	`)
	if err != nil {
		t.Fatal(err)
	}

	dayMs := int64(1782907200000)
	_, err = db.Exec(`INSERT INTO project (id, worktree, name, sandboxes, time_created, time_updated) VALUES (?, ?, ?, '[]', ?, ?)`,
		"proj-1", "/tmp/acme-web", "acme-web", dayMs, dayMs)
	if err != nil {
		t.Fatal(err)
	}
	_, err = db.Exec(`
		INSERT INTO session (
			id, project_id, slug, directory, title, version,
			summary_additions, summary_deletions, summary_files,
			time_created, time_updated, model
		) VALUES (?, ?, 'slug', ?, ?, '1', 42, 7, 3, ?, ?, ?)
	`, "ses-work-1", "proj-1", "/tmp/acme-web", "Ship onboarding polish", dayMs, dayMs+60000,
		`{"id":"big-pickle","providerID":"opencode"}`)
	if err != nil {
		t.Fatal(err)
	}
	_, err = db.Exec(`
		INSERT INTO session (
			id, project_id, slug, directory, title, version,
			time_created, time_updated, model
		) VALUES (?, ?, 'slug', ?, '', '1', ?, ?, '')
	`, "ses-empty", "proj-1", "/tmp/acme-web", dayMs, dayMs)
	if err != nil {
		t.Fatal(err)
	}
	return dbPath
}

func TestExtractOpenCodeSessions(t *testing.T) {
	dbPath := writeOpenCodeWorkFixture(t)
	restore := scan.SetOpenCodeDBPathForTest(dbPath)
	defer restore()

	sessions := extractOpenCode()
	if len(sessions) != 1 {
		t.Fatalf("sessions = %#v", sessions)
	}
	session := sessions[0]
	if session.LocalID != "opencode:ses-work-1" {
		t.Fatalf("localId = %q", session.LocalID)
	}
	if session.ToolName != "opencode" || session.Title != "Ship onboarding polish" {
		t.Fatalf("session = %#v", session)
	}
	if session.Model != "opencode/big-pickle" {
		t.Fatalf("model = %q", session.Model)
	}
	if session.Source != opencodeWorkSource {
		t.Fatalf("source = %q", session.Source)
	}
	if session.Trace == nil || session.Trace.Location == nil || session.Trace.Location.Project != "acme-web" {
		t.Fatalf("location = %#v", session.Trace)
	}
	if session.Trace.Stats == nil || session.Trace.Stats.LinesAdded != 42 || session.Trace.Stats.LinesRemoved != 7 || session.Trace.Stats.FilesChanged != 3 {
		t.Fatalf("stats = %#v", session.Trace.Stats)
	}
	if session.StartedAt == "" || session.EndedAt == "" || session.ObservedAt == "" {
		t.Fatalf("timestamps = %#v", session)
	}
}

func TestExtractOpenCodeMissingDB(t *testing.T) {
	restore := scan.SetOpenCodeDBPathForTest(filepath.Join(t.TempDir(), "missing.db"))
	defer restore()

	if sessions := extractOpenCode(); len(sessions) != 0 {
		t.Fatalf("sessions = %#v", sessions)
	}
}

func TestExtractOpenCodeLiveLocalDB(t *testing.T) {
	if os.Getenv("UJ_LIVE_OPENCODE") != "1" {
		t.Skip("set UJ_LIVE_OPENCODE=1 to run against local OpenCode state")
	}
	restore := scan.SetOpenCodeDBPathForTest("")
	defer restore()

	if scan.OpenCodeDBPath() == "" {
		t.Skip("opencode.db not present on this machine")
	}

	sessions := extractOpenCode()
	if len(sessions) == 0 {
		t.Fatal("expected work sessions from live opencode.db")
	}
	for _, session := range sessions {
		if session.ToolName != "opencode" {
			t.Fatalf("unexpected tool %q", session.ToolName)
		}
		if session.Source != opencodeWorkSource {
			t.Fatalf("unexpected source %q", session.Source)
		}
		if session.LocalID == "" || session.ObservedAt == "" {
			t.Fatalf("incomplete session %#v", session)
		}
	}
	t.Logf("live opencode work sessions: %d", len(sessions))
}
