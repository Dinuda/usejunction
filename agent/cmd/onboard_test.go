package cmd

import "testing"

func TestHumanizeCollectProgress(t *testing.T) {
	if got := humanizeCollectProgress("scan", "Scanning cursor"); got != "Scanning cursor" {
		t.Fatalf("expected message passthrough, got %q", got)
	}
	if got := humanizeCollectProgress("heartbeat", ""); got != "Registering local agent" {
		t.Fatalf("expected heartbeat fallback, got %q", got)
	}
	if got := humanizeCollectProgress("upload-usage", "  Syncing usage (934 rows)  "); got != "Syncing usage (934 rows)" {
		t.Fatalf("expected trimmed message, got %q", got)
	}
}
