package workextract

import (
	"testing"
	"time"

	"github.com/usejunction/agent/internal/client"
)

func TestCaptureUserTurnRedactsSecrets(t *testing.T) {
	if _, ok := captureUserTurn("token sk-abcdefghijklmnopqrstuvwxyz012345", time.Time{}); ok {
		t.Fatal("expected secret drop")
	}
	turn, ok := captureUserTurn("Please add user message capture to work extraction", time.Now().UTC())
	if !ok || turn.Text == "" || turn.At == "" {
		t.Fatalf("got %#v ok=%v", turn, ok)
	}
}

func TestCaptureUserTurnUnwrapsQuery(t *testing.T) {
	turn, ok := captureUserTurn(`<timestamp>x</timestamp><user_query>Ship file changelog</user_query>`, time.Time{})
	if !ok || turn.Text != "Ship file changelog" {
		t.Fatalf("got %#v", turn)
	}
}

func TestMergeFileChangelog(t *testing.T) {
	rows := []client.WorkTraceFileChange{
		{File: "a.ts", Op: "edit", Source: "tool", Events: 1},
		{File: "a.ts", Op: "edit", Source: "tool", Events: 2},
		{File: "b.go", Op: "write", Source: "composer", Events: 5},
	}
	got := mergeFileChangelog(rows)
	if len(got) != 2 {
		t.Fatalf("len=%d %#v", len(got), got)
	}
	if got[0].Events != 3 {
		t.Fatalf("merged events=%d", got[0].Events)
	}
}

func TestFileOpFromTool(t *testing.T) {
	if fileOpFromTool("StrReplace") != "edit" {
		t.Fatal("StrReplace")
	}
	if fileOpFromTool("Write") != "write" {
		t.Fatal("Write")
	}
	if fileOpFromTool("Read") != "read" {
		t.Fatal("Read")
	}
}

func TestRecordToolFileChangeAttachesToCurrentTurn(t *testing.T) {
	turns := []client.WorkTraceUserTurn{{Text: "Please edit the page"}}
	var changes []client.WorkTraceFileChange
	turns, changes = recordToolFileChange(turns, changes, "StrReplace", "page.tsx")
	turns, changes = recordToolFileChange(turns, changes, "StrReplace", "page.tsx")
	turns = append(turns, client.WorkTraceUserTurn{Text: "Now add tests"})
	turns, changes = recordToolFileChange(turns, changes, "Write", "page.test.tsx")

	if len(changes) != 3 {
		t.Fatalf("session changes=%#v", changes)
	}
	if len(turns[0].Files) != 2 || turns[0].Files[0].File != "page.tsx" {
		t.Fatalf("turn0 files=%#v", turns[0].Files)
	}
	if len(turns[1].Files) != 1 || turns[1].Files[0].File != "page.test.tsx" {
		t.Fatalf("turn1 files=%#v", turns[1].Files)
	}

	trace := &client.WorkTrace{}
	applyThreadCapture(trace, turns, changes)
	if len(trace.UserTurns[0].Files) != 1 {
		t.Fatalf("merged turn0 files=%#v", trace.UserTurns[0].Files)
	}
	if trace.UserTurns[0].Files[0].Events != 2 {
		t.Fatalf("expected 2 events, got %d", trace.UserTurns[0].Files[0].Events)
	}
	if len(trace.UserTurns[1].Files) != 1 || trace.UserTurns[1].Files[0].File != "page.test.tsx" {
		t.Fatalf("turn1 after apply=%#v", trace.UserTurns[1].Files)
	}
}

func TestCaptureChangeNarrativeWrapUp(t *testing.T) {
	raw := "Updated the release docs and wired them into the top-level README.\n\n- Expanded `agent-releases.md` into a full guide\n- Added a Release development section to `README.md`\n\nNo runtime behavior changed here, just documentation."
	n, ok := captureChangeNarrative(raw, time.Now().UTC(), changeNarrativeSourceAssistantFinal, true)
	if !ok {
		t.Fatal("expected narrative")
	}
	if n.Source != changeNarrativeSourceAssistantFinal {
		t.Fatalf("source=%s", n.Source)
	}
	if len(n.Bullets) < 2 {
		t.Fatalf("bullets=%#v", n.Bullets)
	}
	if _, ok := captureChangeNarrative("token sk-abcdefghijklmnopqrstuvwxyz012345 updated foo", time.Time{}, changeNarrativeSourceAssistantFinal, true); ok {
		t.Fatal("expected secret drop")
	}
	if _, ok := captureChangeNarrative("ok", time.Time{}, changeNarrativeSourceAssistantFinal, true); ok {
		t.Fatal("expected short drop")
	}
}

func TestPreferChangeNarrativeRanksSources(t *testing.T) {
	a := &client.WorkTraceChangeNarrative{Text: "assistant wrap", Source: changeNarrativeSourceAssistantFinal}
	c := &client.WorkTraceChangeNarrative{Text: "conversation summary text here", Source: changeNarrativeSourceConversationSummary}
	got := preferChangeNarrative(a, c)
	if got.Source != changeNarrativeSourceConversationSummary {
		t.Fatalf("got %#v", got)
	}
}

func TestChangeNarrativeFromComposerSubtitleSkipsFileList(t *testing.T) {
	if n := changeNarrativeFromComposerSubtitle("Edited a.ts, b.go", time.Time{}); n != nil {
		t.Fatalf("expected skip, got %#v", n)
	}
	if n := changeNarrativeFromComposerSubtitle("Documented the operator release flow end to end", time.Time{}); n == nil {
		t.Fatal("expected prose subtitle")
	}
}

func TestLooksLikeToolListTldr(t *testing.T) {
	if !looksLikeToolListTldr("Read, Grep, StrReplace, +3") {
		t.Fatal("expected tool list")
	}
	if looksLikeToolListTldr("Plan a Signals-gated extraction flag") {
		t.Fatal("expected prose")
	}
}
