package workextract

import (
	"strings"
	"testing"

	"github.com/usejunction/agent/internal/client"
)

func TestDeriveIntentRedactsSecrets(t *testing.T) {
	if got := deriveIntentFromUserTurn("use sk-abcdefghijklmnopqrstuvwxyz012345"); got != "" {
		t.Fatalf("expected empty, got %q", got)
	}
	got := deriveIntentFromUserTurn("Please expand work extraction metadata for Cursor")
	if got == "" {
		t.Fatal("expected derived intent")
	}
	wrapped := deriveIntentFromUserTurn(`<timestamp>Friday</timestamp>
<user_query>
Strategic work-episode understanding
Implement the plan as specified
</user_query>`)
	if !strings.Contains(wrapped, "Strategic work-episode") {
		t.Fatalf("wrapped intent=%q", wrapped)
	}
}

func TestBuildUnderstandingIntentPriority(t *testing.T) {
	session := &client.WorkSession{
		ToolName: "cursor",
		Model:    "composer-2.5",
		Mode:     "agent",
		Title:    "Weak title",
		Trace:    &client.WorkTrace{Tools: []string{"Read", "Write"}, PhaseFingerprint: "explore>edit"},
	}
	buildUnderstanding(session, understandingEvidence{
		SummaryBullet: "Ship episode understanding claims",
		UserTurns:     2,
		ToolCalls:     5,
	})
	u := session.Trace.Understanding
	if u == nil || u.Intent != "Ship episode understanding claims" || u.IntentSource != "summary" {
		t.Fatalf("understanding=%#v", u)
	}
	if u.Confidence == nil || u.Confidence.Intent < 0.8 {
		t.Fatalf("confidence=%#v", u.Confidence)
	}
	if u.Actors == nil || u.Actors.Tool != "cursor" {
		t.Fatalf("actors=%#v", u.Actors)
	}
}

func TestBuildUnderstandingAuthorshipAndOutcome(t *testing.T) {
	committed := true
	session := &client.WorkSession{
		ToolName: "cursor",
		Trace: &client.WorkTrace{
			Verify: &client.WorkTraceVerify{AfterEdit: true, Kinds: []string{"lint"}},
			Git:    &client.WorkTraceGit{Committed: &committed},
			Churn:  &client.WorkTraceChurn{FilesRewritten: 2, RewriteEvents: 3},
		},
	}
	buildUnderstanding(session, understandingEvidence{
		HasAuthorship:   true,
		AIEditEvents:    80,
		HumanEditEvents: 20,
		RequestCount:    3,
		UserTurns:       3,
	})
	u := session.Trace.Understanding
	if u.Authorship == nil || u.Authorship.AIShare < 0.7 {
		t.Fatalf("authorship=%#v", u.Authorship)
	}
	if u.Outcome == nil || u.Outcome.Status != "committed" {
		t.Fatalf("outcome=%#v", u.Outcome)
	}
	if u.Attempts == nil || u.Attempts.Score < 2 {
		t.Fatalf("attempts=%#v", u.Attempts)
	}
}

func TestToolPhaseExecAndEdit(t *testing.T) {
	if got := toolPhase("exec", "vitest"); got != "verify" {
		t.Fatalf("exec vitest => %q", got)
	}
	if got := toolPhase("Edit", ""); got != "edit" {
		t.Fatalf("Edit => %q", got)
	}
	if got := toolPhase("exec_command", ""); got != "explore" {
		t.Fatalf("exec_command => %q", got)
	}
}

func TestBuildUnderstandingSkipsToolListTldr(t *testing.T) {
	session := &client.WorkSession{
		ToolName: "cursor",
		Title:    "Cursor agent · usejunciton",
		Tldr:     "Read, Task, Grep, AskQuestion, Glob, CreatePlan, +5",
		Trace:    &client.WorkTrace{},
	}
	buildUnderstanding(session, understandingEvidence{
		DerivedUserTurn: "Expand work episode understanding strategically",
		UserTurns:       1,
	})
	u := session.Trace.Understanding
	if u == nil || u.IntentSource != "user_turn_derived" {
		t.Fatalf("expected derived intent, got %#v", u)
	}
	if !strings.Contains(u.Intent, "understanding") {
		t.Fatalf("intent=%q", u.Intent)
	}
}
