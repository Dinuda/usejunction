package scan

import (
	"fmt"
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
	t.Setenv("USERPROFILE", dir)
	_ = os.MkdirAll(filepath.Join(dir, ".usejunction", "cache", "cost-usage"), 0700)
	if config.CacheDir() == "" {
		t.Fatal("cache dir empty")
	}

	now := time.Date(2026, 7, 17, 15, 0, 0, 0, time.UTC)
	today := types.DailyUsage{Date: "2026-07-17", ToolName: "cursor", Model: "composer", InputTokens: 10, Source: "cursor_local"}
	old := types.DailyUsage{Date: "2026-07-10", ToolName: "claude", Model: "sonnet", InputTokens: 5, Source: "local_scan"}
	oldChanged := types.DailyUsage{Date: "2026-07-10", ToolName: "claude", Model: "sonnet", InputTokens: 9, Source: "local_scan"}
	tooOld := types.DailyUsage{Date: "2026-04-01", ToolName: "codex", Model: "gpt", InputTokens: 100, Source: "local_scan"}

	first := FilterUsageUploadDelta([]types.DailyUsage{today, old, tooOld}, now)
	if len(first) != 2 {
		t.Fatalf("first = %#v (too-old row must be dropped)", first)
	}
	if first[0].Date != "2026-07-17" {
		t.Fatalf("expected newest-first, got %#v", first)
	}
	if err := RememberUsageUpload(first); err != nil {
		t.Fatal(err)
	}

	second := FilterUsageUploadDelta([]types.DailyUsage{today, old, tooOld}, now)
	if len(second) != 1 || second[0].Date != "2026-07-17" {
		t.Fatalf("second = %#v", second)
	}

	third := FilterUsageUploadDelta([]types.DailyUsage{today, oldChanged}, now)
	if len(third) != 2 {
		t.Fatalf("third = %#v", third)
	}
}

func TestFilterUsageLookback(t *testing.T) {
	now := time.Date(2026, 7, 21, 12, 0, 0, 0, time.UTC)
	rows := []types.DailyUsage{
		{Date: "2026-07-21", ToolName: "cursor"},
		{Date: "2026-05-22", ToolName: "codex"}, // exactly 60 days back inclusive
		{Date: "2026-05-21", ToolName: "claude"}, // outside
	}
	got := FilterUsageLookback(rows, now)
	if len(got) != 2 {
		t.Fatalf("got %#v", got)
	}
	for _, row := range got {
		if row.ToolName == "claude" {
			t.Fatalf("lookback leaked old row: %#v", row)
		}
	}
}

func TestTakeUsageUploadBatch(t *testing.T) {
	pending := make([]types.DailyUsage, 0, 400)
	for i := 0; i < 400; i++ {
		pending = append(pending, types.DailyUsage{Date: "2026-07-21", ToolName: "codex", Model: string(rune('a'+(i%26))) + string(rune('0'+(i%10)))})
	}
	batch, remaining := TakeUsageUploadBatch(pending, 50, 2)
	if len(batch) != 100 {
		t.Fatalf("batch=%d", len(batch))
	}
	if len(remaining) != 300 {
		t.Fatalf("remaining=%d", len(remaining))
	}
	budget, rest := TakeUsageUploadBatch(pending, UsageUploadBatchSize, UsageUploadMaxBatchesPerSync)
	wantBudget := UsageUploadBatchSize * UsageUploadMaxBatchesPerSync
	if len(budget) != wantBudget {
		t.Fatalf("default budget=%d want %d", len(budget), wantBudget)
	}
	if len(rest) != 400-wantBudget {
		t.Fatalf("default remaining=%d", len(rest))
	}
	all, none := TakeUsageUploadBatch(pending[:40], 50, 2)
	if len(all) != 40 || none != nil {
		t.Fatalf("all=%d remaining=%#v", len(all), none)
	}
}

func TestSplitUsageUploadBatches(t *testing.T) {
	rows := make([]types.DailyUsage, 0, 120)
	for i := 0; i < 120; i++ {
		rows = append(rows, types.DailyUsage{Date: "2026-07-21", Model: fmt.Sprintf("m%d", i)})
	}
	batches := SplitUsageUploadBatches(rows, 50)
	if len(batches) != 3 {
		t.Fatalf("batches=%d", len(batches))
	}
	if len(batches[0]) != 50 || len(batches[1]) != 50 || len(batches[2]) != 20 {
		t.Fatalf("sizes=%d,%d,%d", len(batches[0]), len(batches[1]), len(batches[2]))
	}
	if SplitUsageUploadBatches(nil, 50) != nil {
		t.Fatal("nil input should yield nil")
	}
}
