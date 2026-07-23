package syncengine

import (
	"testing"

	"github.com/usejunction/agent/internal/client"
)

func TestToolsContentHashStableUnderReorder(t *testing.T) {
	a := ToolsContentHash([]client.ToolReport{
		{ToolName: "cursor", Detected: true, Configured: true, Version: "1.0", ConfigPath: "/a"},
		{ToolName: "codex", Detected: true, Configured: false, Version: "2.0", ConfigPath: "/b"},
	})
	b := ToolsContentHash([]client.ToolReport{
		{ToolName: "codex", Detected: true, Configured: false, Version: "2.0", ConfigPath: "/b"},
		{ToolName: "cursor", Detected: true, Configured: true, Version: "1.0", ConfigPath: "/a"},
	})
	if a != b {
		t.Fatalf("expected stable hash, got %q vs %q", a, b)
	}
	if len(a) != 32 {
		t.Fatalf("expected 32-char hash, got %q", a)
	}
}

func TestToolsContentHashChangesOnConfigured(t *testing.T) {
	base := ToolsContentHash([]client.ToolReport{
		{ToolName: "cursor", Detected: true, Configured: false, Version: "1.0"},
	})
	flipped := ToolsContentHash([]client.ToolReport{
		{ToolName: "cursor", Detected: true, Configured: true, Version: "1.0"},
	})
	if base == flipped {
		t.Fatal("expected hash to change when configured flips")
	}
}

func TestToolsContentHashMatchesAdminFixture(t *testing.T) {
	got := ToolsContentHash([]client.ToolReport{
		{ToolName: "cursor", Detected: true, Configured: true, Version: "1.0", ConfigPath: "/a"},
		{ToolName: "codex", Detected: true, Configured: false, Version: "2.0", ConfigPath: "/b"},
	})
	const want = "a036ac0d9be668e0f61d9265a7d4777a"
	if got != want {
		t.Fatalf("hash mismatch with admin fixture: got %q want %q", got, want)
	}
}
