package updater

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/usejunction/agent/internal/client"
	"github.com/usejunction/agent/internal/config"
)

var testSigningPublic, testSigningPrivate, _ = ed25519.GenerateKey(rand.Reader)

func init() {
	TrustedUpdateSigningKeys = "test:" + base64.RawURLEncoding.EncodeToString(testSigningPublic)
}

type recordingReporter struct {
	events []client.AgentUpdateEvent
}

func (r *recordingReporter) ReportAgentUpdate(event client.AgentUpdateEvent) error {
	r.events = append(r.events, event)
	return nil
}

func directiveFor(serverURL string, payload []byte) client.AgentUpdateDirective {
	digest := sha256.Sum256(payload)
	directive := client.AgentUpdateDirective{
		ReleaseID: "release-1", AttemptID: "attempt-1", TargetVersion: "0.2.0",
		Urgency: "normal", ArtifactURL: serverURL, ArtifactKey: "darwin-arm64", SHA256: hex.EncodeToString(digest[:]), Size: int64(len(payload)),
	}
	directive.Manifest = client.AgentReleaseManifest{
		SchemaVersion: 1,
		Version:       directive.TargetVersion,
		PublishedAt:   "2026-07-19T00:00:00.000Z",
		Urgency:       directive.Urgency,
		RolloutHours:  24,
		SigningKeyID:  "test",
		Artifacts: map[string]client.AgentReleaseArtifact{
			directive.ArtifactKey: {URL: directive.ArtifactURL, SHA256: directive.SHA256, Size: directive.Size},
		},
	}
	payloadBytes, _ := signedManifestBytes(directive.Manifest)
	directive.Manifest.Signature = base64.RawURLEncoding.EncodeToString(ed25519.Sign(testSigningPrivate, payloadBytes))
	return directive
}

func TestCompareVersions(t *testing.T) {
	tests := []struct {
		left, right string
		want        int
		valid       bool
	}{
		{"0.2.0", "0.1.9", 1, true},
		{"v1.0.0", "1.0.0", 0, true},
		{"1.0.0-beta.2", "1.0.0-beta.11", -1, true},
		{"1.0.0", "1.0.0-rc.1", 1, true},
		{"1.0", "1.0.0", 0, false},
		{"01.0.0", "1.0.0", 0, false},
		{"1.0.0-beta.01", "1.0.0", 0, false},
		{"1.0.0-", "1.0.0", 0, false},
	}
	for _, test := range tests {
		got, valid := CompareVersions(test.left, test.right)
		if valid != test.valid || (valid && got != test.want) {
			t.Fatalf("CompareVersions(%q, %q) = (%d, %v), want (%d, %v)", test.left, test.right, got, valid, test.want, test.valid)
		}
	}
}

func TestApplyConfirmAndRollback(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("USERPROFILE", home)
	binDir := t.TempDir()
	executable := filepath.Join(binDir, "usejunction")
	if err := os.WriteFile(executable, []byte("old-binary"), 0755); err != nil {
		t.Fatal(err)
	}
	payload := []byte("new-binary")
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write(payload)
	}))
	defer server.Close()
	reporter := &recordingReporter{}
	cfg := &config.Config{ControlPlaneURL: server.URL, DeviceToken: "token"}

	updated, err := Apply(context.Background(), cfg, ApplyOptions{
		Directive: directiveFor(server.URL, payload), CurrentVersion: "0.1.0", ControlPlaneURL: server.URL,
		ExecutablePath: executable, HTTPClient: server.Client(), Reporter: reporter,
	})
	if err != nil || !updated {
		t.Fatalf("Apply() = (%v, %v)", updated, err)
	}
	assertFileContents(t, executable, payload)
	assertFileContents(t, executable+".previous", []byte("old-binary"))
	if got := eventNames(reporter.events); got != "download_started,download_completed,install_started" {
		t.Fatalf("events = %s", got)
	}

	confirmed, err := ConfirmPending(cfg, reporter, "0.2.0")
	if err != nil || !confirmed {
		t.Fatalf("ConfirmPending() = (%v, %v)", confirmed, err)
	}
	if _, err := os.Stat(config.UpdateStatePath()); !os.IsNotExist(err) {
		t.Fatalf("pending state was not cleared: %v", err)
	}

	if err := Rollback(cfg, reporter, executable); err != nil {
		t.Fatal(err)
	}
	assertFileContents(t, executable, []byte("old-binary"))
	assertFileContents(t, executable+".previous", payload)
	if cfg.BlockedUpdateVersion != "0.2.0" {
		t.Fatalf("blocked version = %q", cfg.BlockedUpdateVersion)
	}
	confirmed, err = ConfirmPending(cfg, reporter, "0.1.0")
	if err != nil || !confirmed {
		t.Fatalf("rollback ConfirmPending() = (%v, %v)", confirmed, err)
	}
	if got := eventNames(reporter.events); got != "download_started,download_completed,install_started,install_confirmed,rollback_started,rollback_confirmed" {
		t.Fatalf("events = %s", got)
	}
}

func TestChecksumFailureLeavesCurrentBinary(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("USERPROFILE", home)
	binDir := t.TempDir()
	executable := filepath.Join(binDir, "usejunction")
	if err := os.WriteFile(executable, []byte("current"), 0755); err != nil {
		t.Fatal(err)
	}
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte("corrupt"))
	}))
	defer server.Close()
	directive := directiveFor(server.URL, []byte("expected"))
	directive.Size = int64(len("corrupt"))
	updated, err := Apply(context.Background(), &config.Config{}, ApplyOptions{
		Directive: directive, CurrentVersion: "0.1.0", ExecutablePath: executable,
		HTTPClient: server.Client(), Reporter: &recordingReporter{},
	})
	if err == nil || updated {
		t.Fatalf("Apply() = (%v, %v), want checksum failure", updated, err)
	}
	assertFileContents(t, executable, []byte("current"))
	if _, err := os.Stat(executable + ".previous"); !os.IsNotExist(err) {
		t.Fatalf("backup unexpectedly exists: %v", err)
	}
}

func TestNodeCompatibleManifestSignature(t *testing.T) {
	dir := t.TempDir()
	manifestPath := filepath.Join(dir, "manifest.json")
	artifactURL := "https://example.com/usejunction-linux-amd64?arch=amd64&os=linux"
	sha := strings.Repeat("ab", 32)
	unsigned := map[string]any{
		"schemaVersion": 2,
		"version":       "0.3.1",
		"publishedAt":   "2026-07-19T00:00:00.000Z",
		"urgency":       "normal",
		"rolloutHours":  24,
		"artifacts": map[string]any{
			"darwin-amd64":  map[string]any{"url": artifactURL, "sha256": sha, "size": 1024},
			"darwin-arm64":  map[string]any{"url": artifactURL, "sha256": sha, "size": 1024},
			"linux-amd64":   map[string]any{"url": artifactURL, "sha256": sha, "size": 1024},
			"linux-arm64":   map[string]any{"url": artifactURL, "sha256": sha, "size": 1024},
			"windows-amd64": map[string]any{"url": artifactURL, "sha256": sha, "size": 1024},
			"windows-arm64": map[string]any{"url": artifactURL, "sha256": sha, "size": 1024},
		},
	}
	raw, err := json.Marshal(unsigned)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(manifestPath, raw, 0o644); err != nil {
		t.Fatal(err)
	}

	root := filepath.Join("..", "..", "..")
	script := filepath.Join(root, "scripts", "sign-agent-release-manifest.js")
	if _, err := os.Stat(script); err != nil {
		t.Skip("sign script not available from test working directory")
	}
	cmd := exec.Command("node", script, manifestPath, "critical")
	cmd.Env = append(os.Environ(),
		"AGENT_UPDATE_SIGNING_KEY_ID=test",
		"AGENT_UPDATE_SIGNING_PRIVATE_KEY="+hex.EncodeToString(testSigningPrivate.Seed()),
	)
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("node sign failed: %v\n%s", err, out)
	}

	var signed client.AgentReleaseManifest
	body, err := os.ReadFile(manifestPath)
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(body, &signed); err != nil {
		t.Fatal(err)
	}
	if signed.Urgency != "critical" || signed.RolloutHours != 0 {
		t.Fatalf("urgency rewrite = %+v", signed)
	}
	directive := client.AgentUpdateDirective{
		TargetVersion: signed.Version,
		Urgency:       signed.Urgency,
		ArtifactURL:   artifactURL,
		ArtifactKey:   "linux-amd64",
		SHA256:        sha,
		Size:          1024,
		Manifest:      signed,
	}
	if err := verifyDirectiveSignature(directive); err != nil {
		t.Fatalf("verifyDirectiveSignature: %v", err)
	}
}

func TestApplyRejectsOversizedAndBlockedVersions(t *testing.T) {
	directive := client.AgentUpdateDirective{TargetVersion: "0.2.0", Size: MaxArtifactBytes + 1, SHA256: string(make([]byte, 64))}
	if updated, err := Apply(context.Background(), &config.Config{}, ApplyOptions{Directive: directive, CurrentVersion: "0.1.0"}); err == nil || updated {
		t.Fatalf("oversized Apply() = (%v, %v)", updated, err)
	}
	directive.Size = 1
	if updated, err := Apply(context.Background(), &config.Config{BlockedUpdateVersion: "0.2.0"}, ApplyOptions{Directive: directive, CurrentVersion: "0.1.0"}); err != ErrBlockedVersion || updated {
		t.Fatalf("blocked Apply() = (%v, %v)", updated, err)
	}
}

func TestApplySkipsLocalDevVersion(t *testing.T) {
	directive := client.AgentUpdateDirective{
		TargetVersion: "0.2.0",
		Size:          12,
		SHA256:        strings.Repeat("a", 64),
	}
	updated, err := Apply(context.Background(), &config.Config{}, ApplyOptions{
		Directive: directive, CurrentVersion: "0.0.0-dev.abc123.1700000000",
	})
	if updated || !errors.Is(err, ErrLocalDevPinned) {
		t.Fatalf("expected ErrLocalDevPinned, got updated=%v err=%v", updated, err)
	}
	if !IsLocalDevVersion("0.0.0-dev.abc123.1") || IsLocalDevVersion("0.1.0") {
		t.Fatal("IsLocalDevVersion mismatch")
	}
}

func TestApplyRejectsBadAndUnknownSignatures(t *testing.T) {
	payload := []byte("new-binary")
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write(payload)
	}))
	defer server.Close()
	directive := directiveFor(server.URL, payload)
	directive.Manifest.Signature = base64.RawURLEncoding.EncodeToString([]byte("bad"))
	if updated, err := Apply(context.Background(), &config.Config{}, ApplyOptions{Directive: directive, CurrentVersion: "0.1.0"}); err == nil || updated {
		t.Fatalf("bad signature Apply() = (%v, %v)", updated, err)
	}
	directive = directiveFor(server.URL, payload)
	directive.Manifest.SigningKeyID = "unknown"
	payloadBytes, _ := signedManifestBytes(directive.Manifest)
	directive.Manifest.Signature = base64.RawURLEncoding.EncodeToString(ed25519.Sign(testSigningPrivate, payloadBytes))
	if updated, err := Apply(context.Background(), &config.Config{}, ApplyOptions{Directive: directive, CurrentVersion: "0.1.0"}); err == nil || updated {
		t.Fatalf("unknown key Apply() = (%v, %v)", updated, err)
	}
}

func assertFileContents(t *testing.T, path string, expected []byte) {
	t.Helper()
	actual, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if string(actual) != string(expected) {
		t.Fatalf("%s = %q, want %q", path, actual, expected)
	}
}

func eventNames(events []client.AgentUpdateEvent) string {
	result := ""
	for index, event := range events {
		if index > 0 {
			result += ","
		}
		result += event.Event
	}
	return result
}
