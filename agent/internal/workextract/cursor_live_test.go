package workextract

import (
	"os"
	"testing"
)

func TestLiveCursorComposerHeadersPresent(t *testing.T) {
	if os.Getenv("UJ_LIVE_CURSOR_EXTRACT") != "1" {
		t.Skip("set UJ_LIVE_CURSOR_EXTRACT=1 to run against local Cursor DBs")
	}
	sessions := extractCursor(50)
	cursor := 0
	for _, session := range sessions {
		if session.ToolName == "cursor" {
			cursor++
			t.Logf("%s | model=%s mode=%s source=%s", session.Title, session.Model, session.Mode, session.Source)
		}
	}
	if cursor == 0 {
		t.Fatal("expected Cursor composer sessions from local state.vscdb")
	}
}
