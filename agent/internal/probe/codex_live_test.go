//go:build integration

package probe

import (
	"context"
	"os"
	"path/filepath"
	"testing"
)

func TestProbeCodexQuotaLive(t *testing.T) {
	home := os.Getenv("CODEX_HOME")
	if home == "" {
		home = filepath.Join(mustUserHome(t), ".codex")
	}
	if _, err := os.Stat(filepath.Join(home, "auth.json")); err != nil {
		t.Skip("no local codex auth.json")
	}
	snaps, acc, err := ProbeCodexQuota(context.Background(), home)
	if err != nil {
		t.Fatalf("ProbeCodexQuota: %v", err)
	}
	if acc == nil || acc.Plan == "" {
		t.Fatalf("account plan missing: %+v", acc)
	}
	if len(snaps) == 0 {
		t.Fatalf("expected quota snapshots")
	}
}

func mustUserHome(t *testing.T) string {
	t.Helper()
	home, err := os.UserHomeDir()
	if err != nil {
		t.Fatal(err)
	}
	return home
}
