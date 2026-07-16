package updater

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/usejunction/agent/internal/client"
	"github.com/usejunction/agent/internal/config"
)

type recordingReporter struct {
	events []client.AgentUpdateEvent
}

func (r *recordingReporter) ReportAgentUpdate(event client.AgentUpdateEvent) error {
	r.events = append(r.events, event)
	return nil
}

func directiveFor(serverURL string, payload []byte) client.AgentUpdateDirective {
	digest := sha256.Sum256(payload)
	return client.AgentUpdateDirective{
		ReleaseID: "release-1", AttemptID: "attempt-1", TargetVersion: "0.2.0",
		Urgency: "normal", ArtifactURL: serverURL, SHA256: hex.EncodeToString(digest[:]), Size: int64(len(payload)),
	}
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
	t.Setenv("HOME", t.TempDir())
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
