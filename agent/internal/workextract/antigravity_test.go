package workextract

import (
	"database/sql"
	"encoding/base64"
	"os"
	"path/filepath"
	"testing"

	"github.com/usejunction/agent/internal/probe"
)

func TestExtractAntigravityFromTrajectorySummaries(t *testing.T) {
	dir := t.TempDir()
	dbPath := filepath.Join(dir, "state.vscdb")
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatal(err)
	}
	trajInner := []byte("11111111-2222-3333-4444-555555555555\x00Ship onboarding polish\x00file:///Users/dev/work/acme-web\x00https://github.com/acme/acme-web.git")
	traj := base64.StdEncoding.EncodeToString(trajInner)
	if _, err := db.Exec(`CREATE TABLE ItemTable (key TEXT UNIQUE ON CONFLICT REPLACE, value BLOB)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO ItemTable (key, value) VALUES (?, ?)`, "antigravityUnifiedStateSync.trajectorySummaries", traj); err != nil {
		t.Fatal(err)
	}
	_ = db.Close()

	restore := probe.SetAntigravityStateDBPathForTest(dbPath)
	defer restore()

	sessions := extractAntigravity()
	if len(sessions) == 0 {
		t.Fatal("expected sessions from trajectory summaries")
	}
	found := false
	for _, session := range sessions {
		if session.LocalID != "11111111-2222-3333-4444-555555555555" {
			continue
		}
		found = true
		if session.ToolName != "antigravity" || session.Title != "Ship onboarding polish" {
			t.Fatalf("session = %#v", session)
		}
		if session.Repository == nil || session.Repository.Name != "acme-web" {
			t.Fatalf("repo = %#v", session.Repository)
		}
		if session.Source != antigravityWorkSource {
			t.Fatalf("source = %q", session.Source)
		}
	}
	if !found {
		t.Fatalf("sessions = %#v", sessions)
	}
}

func TestExtractAntigravityBrainMetadata(t *testing.T) {
	root := t.TempDir()
	brain := filepath.Join(root, "brain", "cascade-brain-1")
	logs := filepath.Join(brain, ".system_generated", "logs")
	if err := os.MkdirAll(logs, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(brain, "task.md"), []byte("# Rebuild billing dashboard\n\n- step\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	transcript := `{"step_index":0,"source":"USER_EXPLICIT","type":"USER_INPUT","created_at":"2026-07-22T18:39:16Z","content":"The user changed setting ` + "`Model Selection`" + ` from None to Claude Sonnet 4.6 (Thinking)."}` + "\n" +
		`{"step_index":1,"source":"MODEL","type":"PLANNER_RESPONSE","created_at":"2026-07-22T18:39:20Z","tool_calls":[{"name":"view_file"}]}` + "\n"
	if err := os.WriteFile(filepath.Join(logs, "transcript.jsonl"), []byte(transcript), 0o644); err != nil {
		t.Fatal(err)
	}

	prevRoot := os.Getenv("ANTIGRAVITY_CLI_ROOT")
	_ = os.Setenv("ANTIGRAVITY_CLI_ROOT", root)
	defer func() { _ = os.Setenv("ANTIGRAVITY_CLI_ROOT", prevRoot) }()

	sessions := extractAntigravityBrainMetadata()
	if len(sessions) != 1 {
		t.Fatalf("sessions = %#v", sessions)
	}
	if sessions[0].Title != "Rebuild billing dashboard" {
		t.Fatalf("title = %q", sessions[0].Title)
	}
	if sessions[0].Model != "claude-sonnet-4.6" {
		t.Fatalf("model = %q", sessions[0].Model)
	}
	if sessions[0].ToolCallCounts["view_file"] != 1 {
		t.Fatalf("tools = %#v", sessions[0].ToolCallCounts)
	}
	if sessions[0].Source != "antigravity_brain" {
		t.Fatalf("source = %q", sessions[0].Source)
	}
}
