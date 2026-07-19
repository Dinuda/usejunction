package workextract

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/usejunction/agent/internal/client"
)

func TestExtractCodexStructuredMetadata(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "session.jsonl")
	content := `{"type":"session_meta","timestamp":"2026-07-17T10:00:00Z","payload":{"id":"sess-1","originator":"codex_vscode","git":{"repository_url":"https://github.com/acme/demo.git"}}}
{"type":"turn_context","timestamp":"2026-07-17T10:00:01Z","payload":{"model":"gpt-5-codex","effort":"low"}}
{"type":"response_item","timestamp":"2026-07-17T10:00:02Z","payload":{"type":"function_call","name":"shell","arguments":"SHOULD_NOT_APPEAR"}}
{"type":"response_item","timestamp":"2026-07-17T10:00:03Z","payload":{"type":"function_call","name":"shell"}}
{"type":"event_msg","timestamp":"2026-07-17T10:00:04Z","payload":{"type":"user_message","message":"secret prompt text"}}
`
	if err := os.WriteFile(path, []byte(content), 0600); err != nil {
		t.Fatal(err)
	}

	session, ok := extractCodexFile(path)
	if !ok {
		t.Fatal("expected session")
	}
	if session.Model != "gpt-5-codex" {
		t.Fatalf("model = %q", session.Model)
	}
	if session.ToolCallCounts["shell"] != 2 {
		t.Fatalf("tool counts = %#v", session.ToolCallCounts)
	}
	if session.Repository == nil || session.Repository.Owner != "acme" || session.Repository.Name != "demo" {
		t.Fatalf("repo = %#v", session.Repository)
	}
	if session.Metadata["effort"] != "low" {
		t.Fatalf("metadata = %#v", session.Metadata)
	}
	if session.Trace == nil || session.Trace.Approach != "effort:low" {
		t.Fatalf("trace = %#v", session.Trace)
	}
	if len(session.Trace.Tools) == 0 || session.Trace.Tools[0] != "shell" {
		t.Fatalf("trace tools = %#v", session.Trace.Tools)
	}
	if session.Trace.Location == nil || session.Trace.Location.Repository == nil || session.Trace.Location.Repository.Name != "demo" {
		t.Fatalf("trace location = %#v", session.Trace.Location)
	}
	// Ensure we did not leak prompt/args into uploaded fields.
	blob := session.Title + session.Tldr + session.Overview
	if contains(blob, "secret") || contains(blob, "SHOULD_NOT") {
		t.Fatalf("leaked sensitive text: %q", blob)
	}
}

func TestExtractClaudeToolNamesOnly(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "claude-session.jsonl")
	content := `{"type":"assistant","timestamp":"2026-07-17T11:00:00Z","sessionId":"c1","message":{"model":"claude-sonnet-4","content":[{"type":"text","text":"secret answer"},{"type":"tool_use","name":"Read"},{"type":"tool_use","name":"Edit"}]}}
{"type":"summary","timestamp":"2026-07-17T11:01:00Z","summary":"Refactor auth middleware"}
`
	if err := os.WriteFile(path, []byte(content), 0600); err != nil {
		t.Fatal(err)
	}
	session, ok := extractClaudeFile(path)
	if !ok {
		t.Fatal("expected session")
	}
	if session.Model != "claude-sonnet-4" {
		t.Fatalf("model = %q", session.Model)
	}
	if session.Title != "Refactor auth middleware" {
		t.Fatalf("title = %q", session.Title)
	}
	if session.ToolCallCounts["Read"] != 1 || session.ToolCallCounts["Edit"] != 1 {
		t.Fatalf("counts = %#v", session.ToolCallCounts)
	}
	if session.Trace == nil || len(session.Trace.Tools) != 2 {
		t.Fatalf("trace = %#v", session.Trace)
	}
	if contains(session.Overview, "secret") {
		t.Fatal("leaked assistant text")
	}
	if session.Trace != nil && session.Trace.ChangeNarrative != nil && contains(session.Trace.ChangeNarrative.Text, "secret") {
		t.Fatal("leaked assistant text into changeNarrative")
	}
}

func TestFilterSinceSkipsOldSessions(t *testing.T) {
	sessions := []client.WorkSession{
		{LocalID: "old", ObservedAt: "2026-01-01T00:00:00Z", Model: "a"},
		{LocalID: "at-watermark", ObservedAt: "2026-07-17T10:00:00Z", Model: "b"},
		{LocalID: "new", ObservedAt: "2026-07-17T12:00:00Z", Model: "c"},
	}
	since, _ := time.Parse(time.RFC3339, "2026-07-17T10:00:00Z")
	filtered := FilterSince(sessions, since)
	if len(filtered) != 1 || filtered[0].LocalID != "new" {
		t.Fatalf("filtered = %#v", filtered)
	}
	// Exact watermark boundary is excluded (already captured).
	for _, session := range filtered {
		if session.LocalID == "at-watermark" {
			t.Fatal("watermark session should be excluded")
		}
	}
	// Empty since keeps all.
	if len(FilterSince(sessions, time.Time{})) != 3 {
		t.Fatal("expected no filter")
	}
}

func TestFilterAtOrAfterUsesObservedTimeInclusively(t *testing.T) {
	sessions := []client.WorkSession{
		{LocalID: "dormant-old", StartedAt: "2026-01-01T00:00:00Z", ObservedAt: "2026-07-19T09:59:59Z"},
		{LocalID: "exact", StartedAt: "2026-01-01T00:00:00Z", ObservedAt: "2026-07-19T10:00:00Z"},
		{LocalID: "updated-after", StartedAt: "2026-01-01T00:00:00Z", ObservedAt: "2026-07-19T10:00:01Z"},
		{LocalID: "invalid", ObservedAt: "not-a-time"},
	}
	cutoff, _ := time.Parse(time.RFC3339, "2026-07-19T10:00:00Z")
	filtered := FilterAtOrAfter(sessions, cutoff)
	if len(filtered) != 2 || filtered[0].LocalID != "exact" || filtered[1].LocalID != "updated-after" {
		t.Fatalf("filtered = %#v", filtered)
	}
	if got := FilterAtOrAfter(sessions, time.Time{}); len(got) != 0 {
		t.Fatalf("missing cutoff must fail closed, got %#v", got)
	}
}

func TestParseComposerHeadersPayload(t *testing.T) {
	raw := []byte(`{
	  "allComposers": [
	    {"composerId":"empty-state-draft","name":"","subtitle":"","unifiedMode":"agent","createdAt":1,"lastUpdatedAt":1},
	    {"composerId":"abc-123","name":"Add work extraction","subtitle":"Edited cursor.go","unifiedMode":"agent","createdAt":1783412593102,"lastUpdatedAt":1783412593310,"isDraft":false},
	    {"composerId":"no-signal","name":"","subtitle":"","unifiedMode":"chat","createdAt":2,"lastUpdatedAt":2}
	  ]
	}`)
	var payload composerHeadersPayload
	if err := json.Unmarshal(raw, &payload); err != nil {
		t.Fatal(err)
	}
	sessions := composerHeadersToSessions(payload.AllComposers, 10)
	if len(sessions) != 1 {
		t.Fatalf("sessions = %#v", sessions)
	}
	if sessions[0].Title != "Add work extraction" {
		t.Fatalf("title = %q", sessions[0].Title)
	}
	if sessions[0].Mode != "agent" {
		t.Fatalf("mode = %q", sessions[0].Mode)
	}
	if sessions[0].Tldr != "Edited cursor.go" {
		t.Fatalf("tldr = %q", sessions[0].Tldr)
	}
	if sessions[0].ToolName != "cursor" || sessions[0].Source != "headers" {
		t.Fatalf("session = %#v", sessions[0])
	}
	if sessions[0].Trace == nil || sessions[0].Trace.Approach != "agent" {
		t.Fatalf("trace = %#v", sessions[0].Trace)
	}
	if len(sessions[0].Trace.Files) != 1 || sessions[0].Trace.Files[0] != "cursor.go" {
		t.Fatalf("files = %#v", sessions[0].Trace.Files)
	}
}

func TestLocationFromCursorProjectSlugSkipsProtectedFolders(t *testing.T) {
	home, err := os.UserHomeDir()
	if err != nil {
		t.Fatal(err)
	}
	user := filepath.Base(home)
	slug := "Users-" + user + "-Documents-work-usejunciton"
	if got := reconstructPathFromCursorSlug(slug); got != "" {
		t.Fatalf("Documents slug must not reconstruct a path (got %q)", got)
	}
	loc := locationFromCursorProjectSlug(slug)
	if loc == nil || loc.Project != "usejunciton" {
		t.Fatalf("expected slug label only, got %#v", loc)
	}
	if loc.Repository != nil {
		t.Fatal("must not git-resolve repos under Documents")
	}
}

func TestSkillNameFromValue(t *testing.T) {
	if got := skillNameFromValue("canvas", true); got != "canvas" {
		t.Fatalf("bare = %q", got)
	}
	if got := skillNameFromValue("/Users/x/.cursor/skills/create-rule/SKILL.md", false); got != "create-rule" {
		t.Fatalf("path = %q", got)
	}
	if got := skillNameFromValue("some file.ts", true); got != "" {
		t.Fatalf("rejected spaced name = %q", got)
	}
	if got := skillNameFromValue("Read", false); got != "" {
		t.Fatalf("rejected non-skill name = %q", got)
	}
}

func contains(hay, needle string) bool {
	return strings.Contains(hay, needle)
}
