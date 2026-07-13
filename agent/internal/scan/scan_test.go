package scan

import (
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

func TestNormalizeRemoteStripsCredentialsAndGitSuffix(t *testing.T) {
	repository := normalizeRemote("https://oauth-token:secret@github.com/Acme/platform.git")
	if repository == nil || repository.Host != "github.com" || repository.Owner != "Acme" || repository.Name != "platform" {
		t.Fatalf("unexpected repository: %#v", repository)
	}
	if normalizeRemote("/Users/alice/private-repo") != nil {
		t.Fatal("local paths must not become repository identities")
	}
}

func TestParseCodexLineUsesEventTimestamp(t *testing.T) {
	row := map[string]any{
		"type": "event_msg",
		"timestamp": "2026-07-03T23:59:58.123Z",
		"msg": map[string]any{"token_count": map[string]any{"input_tokens": float64(4), "output_tokens": float64(2)}},
	}
	date, _, input, output, _, ok := parseCodexLine(row)
	if !ok || date != "2026-07-03" || input != 4 || output != 2 {
		t.Fatalf("unexpected parse result: %s %d %d %v", date, input, output, ok)
	}
}

func TestRepositoryForSessionFileUsesRemoteWithoutReturningLocalPath(t *testing.T) {
	dir := t.TempDir()
	if err := exec.Command("git", "-C", dir, "init").Run(); err != nil {
		t.Fatal(err)
	}
	if err := exec.Command("git", "-C", dir, "remote", "add", "origin", "git@github.com:acme/service.git").Run(); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(t.TempDir(), "session.jsonl")
	row, _ := json.Marshal(map[string]any{"type": "session_meta", "payload": map[string]any{"cwd": dir}})
	if err := os.WriteFile(path, append(row, '\n'), 0600); err != nil {
		t.Fatal(err)
	}
	repository := repositoryForSessionFile(path)
	if repository == nil || repository.Host != "github.com" || repository.Owner != "acme" || repository.Name != "service" {
		t.Fatalf("unexpected repository: %#v", repository)
	}
}
