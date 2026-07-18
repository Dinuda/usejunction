package scan

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/usejunction/agent/internal/config"
	"github.com/usejunction/agent/internal/types"
)

func TestFilterUsageUploadDelta(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("HOME", dir)
	// Force cache under temp home.
	_ = os.MkdirAll(filepath.Join(dir, ".usejunction", "cache", "cost-usage"), 0700)
	if config.CacheDir() == "" {
		t.Fatal("cache dir empty")
	}

	now := time.Date(2026, 7, 17, 15, 0, 0, 0, time.UTC)
	today := types.DailyUsage{Date: "2026-07-17", ToolName: "cursor", Model: "composer", InputTokens: 10, Source: "cursor_local"}
	old := types.DailyUsage{Date: "2026-07-10", ToolName: "claude", Model: "sonnet", InputTokens: 5, Source: "local_scan"}
	oldChanged := types.DailyUsage{Date: "2026-07-10", ToolName: "claude", Model: "sonnet", InputTokens: 9, Source: "local_scan"}

	// First upload: both rows should go (today + unknown history).
	first := FilterUsageUploadDelta([]types.DailyUsage{today, old}, now)
	if len(first) != 2 {
		t.Fatalf("first = %#v", first)
	}
	if err := RememberUsageUpload(first); err != nil {
		t.Fatal(err)
	}

	// Second upload unchanged: only today.
	second := FilterUsageUploadDelta([]types.DailyUsage{today, old}, now)
	if len(second) != 1 || second[0].Date != "2026-07-17" {
		t.Fatalf("second = %#v", second)
	}

	// Historical totals changed: include that row again.
	third := FilterUsageUploadDelta([]types.DailyUsage{today, oldChanged}, now)
	if len(third) != 2 {
		t.Fatalf("third = %#v", third)
	}
}
