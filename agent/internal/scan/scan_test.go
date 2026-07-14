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
		"type":      "event_msg",
		"timestamp": "2026-07-03T23:59:58.123Z",
		"msg":       map[string]any{"token_count": map[string]any{"input_tokens": float64(4), "output_tokens": float64(2)}},
	}
	hit := parseCodexLine(row)
	if !hit.ok || hit.date != "2026-07-03" || hit.input != 4 || hit.output != 2 {
		t.Fatalf("unexpected parse result: %#v", hit)
	}
}

func TestParseCodexLinePayloadTokenCount(t *testing.T) {
	row := map[string]any{
		"type":      "event_msg",
		"timestamp": "2026-06-12T03:39:11.747Z",
		"payload": map[string]any{
			"type": "token_count",
			"info": map[string]any{
				"last_token_usage": map[string]any{
					"input_tokens":            float64(15311),
					"output_tokens":           float64(11),
					"cached_input_tokens":     float64(4480),
					"reasoning_output_tokens": float64(72),
				},
			},
		},
	}
	hit := parseCodexLine(row)
	if !hit.ok || hit.date != "2026-06-12" || hit.input != 15311 || hit.output != 11 || hit.cacheRead != 4480 || hit.reasoning != 72 {
		t.Fatalf("unexpected parse result: %#v", hit)
	}
}

func TestParseClaudeLineCacheWrite(t *testing.T) {
	row := map[string]any{
		"type":      "assistant",
		"timestamp": "2026-07-01T12:00:00Z",
		"message": map[string]any{
			"model": "claude-sonnet-4-5-20250929",
			"usage": map[string]any{
				"input_tokens":                float64(10),
				"output_tokens":               float64(20),
				"cache_read_input_tokens":     float64(100),
				"cache_creation_input_tokens": float64(50),
			},
		},
	}
	hit := parseClaudeLine(row)
	if !hit.ok || hit.cacheWrite != 50 || hit.cacheRead != 100 {
		t.Fatalf("unexpected parse result: %#v", hit)
	}
}

func TestEstimateCostUsesModelRates(t *testing.T) {
	cost := EstimateCost("composer-2.5", 1_000_000, 1_000_000, 0, 0)
	if cost < 2.9 || cost > 3.1 {
		t.Fatalf("unexpected composer cost: %f", cost)
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

func TestIsPrivacyProtectedPath(t *testing.T) {
	home, err := os.UserHomeDir()
	if err != nil {
		t.Fatal(err)
	}
	if !isPrivacyProtectedPath(filepath.Join(home, "Documents", "work")) {
		t.Fatal("Documents should be protected")
	}
	if isPrivacyProtectedPath(filepath.Join(home, "code", "app")) {
		t.Fatal("non-TCC path should not be protected")
	}
}
