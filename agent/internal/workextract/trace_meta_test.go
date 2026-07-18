package workextract

import (
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"

	"github.com/usejunction/agent/internal/client"
)

func TestClampSource(t *testing.T) {
	got := clampSource("cursor_composer_headers", "cursor_conversation_summaries", "cursor_agent_transcript")
	if len(got) > maxSourceLen {
		t.Fatalf("too long: %q (%d)", got, len(got))
	}
	if got != "headers+summaries+transcript" {
		t.Fatalf("got %q", got)
	}
}

func TestBuildPhasesAndChurn(t *testing.T) {
	events := []toolEvent{
		{Name: "Read"},
		{Name: "Grep"},
		{Name: "Write", FileBase: "a.ts"},
		{Name: "StrReplace", FileBase: "a.ts"},
		{Name: "ReadLints"},
		{Name: "Shell", ShellToken: "vitest"},
	}
	phases, fp, verify := buildPhases(events)
	if fp != "explore>edit>verify" {
		t.Fatalf("fingerprint=%q phases=%v", fp, phases)
	}
	if verify == nil || !verify.AfterEdit {
		t.Fatalf("verify=%#v", verify)
	}
	churn := buildChurn(events)
	if churn == nil || churn.FilesRewritten != 1 {
		t.Fatalf("churn=%#v", churn)
	}
	langs, tested := languagesAndTests([]string{"a.ts", "a.test.ts", "main.go"})
	if !tested {
		t.Fatal("expected test involved")
	}
	if len(langs) < 2 {
		t.Fatalf("langs=%v", langs)
	}
}

func TestShellFirstTokenAllowlist(t *testing.T) {
	if got := shellFirstToken("vitest run"); got != "vitest" {
		t.Fatalf("got %q", got)
	}
	if got := shellFirstToken("/usr/bin/evil --secret"); got != "" {
		t.Fatalf("leaked token %q", got)
	}
}

func TestGitCommitsInWindow(t *testing.T) {
	dir := t.TempDir()
	run := func(args ...string) {
		t.Helper()
		cmd := exec.Command("git", append([]string{"-C", dir}, args...)...)
		cmd.Env = append(os.Environ(), "GIT_AUTHOR_NAME=t", "GIT_AUTHOR_EMAIL=t@example.com", "GIT_COMMITTER_NAME=t", "GIT_COMMITTER_EMAIL=t@example.com")
		if out, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("git %v: %v\n%s", args, err, out)
		}
	}
	run("init")
	run("checkout", "-b", "main")
	path := filepath.Join(dir, "hello.txt")
	if err := os.WriteFile(path, []byte("hi\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	run("add", "hello.txt")
	run("commit", "-m", "add hello")

	start := time.Now().UTC().Add(-1 * time.Hour)
	end := time.Now().UTC().Add(1 * time.Hour)
	commits := gitCommitsInWindow(dir, start, end)
	if len(commits) != 1 || commits[0].Subject != "add hello" {
		t.Fatalf("commits=%#v", commits)
	}

	session := client.WorkSession{
		StartedAt:  start.Format(time.RFC3339),
		EndedAt:    end.Format(time.RFC3339),
		ObservedAt: end.Format(time.RFC3339),
		Trace:      &client.WorkTrace{},
	}
	enrichSessionGit(&session, dir)
	if session.Trace.Git == nil || session.Trace.Git.Branch == "" {
		t.Fatalf("git=%#v", session.Trace.Git)
	}
}
