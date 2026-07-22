package scan

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/usejunction/agent/internal/config"
	"github.com/usejunction/agent/internal/types"
)

func setupUsageUploadHome(t *testing.T) {
	t.Helper()
	dir := t.TempDir()
	t.Setenv("HOME", dir)
	t.Setenv("USERPROFILE", dir)
	if err := os.MkdirAll(filepath.Join(dir, ".usejunction", "cache", "cost-usage"), 0700); err != nil {
		t.Fatal(err)
	}
	if config.CacheDir() == "" {
		t.Fatal("cache dir empty")
	}
}

func TestFilterUsageUploadDelta(t *testing.T) {
	setupUsageUploadHome(t)
	org, device := "org-1", "device-1"

	now := time.Date(2026, 7, 17, 15, 0, 0, 0, time.UTC)
	today := types.DailyUsage{Date: "2026-07-17", ToolName: "cursor", Model: "composer", InputTokens: 10, Source: "cursor_local"}
	old := types.DailyUsage{Date: "2026-07-10", ToolName: "claude", Model: "sonnet", InputTokens: 5, Source: "local_scan"}
	oldChanged := types.DailyUsage{Date: "2026-07-10", ToolName: "claude", Model: "sonnet", InputTokens: 9, Source: "local_scan"}
	tooOld := types.DailyUsage{Date: "2026-04-01", ToolName: "codex", Model: "gpt", InputTokens: 100, Source: "local_scan"}

	first := FilterUsageUploadDelta([]types.DailyUsage{today, old, tooOld}, now, org, device)
	if len(first) != 2 {
		t.Fatalf("first = %#v (too-old row must be dropped)", first)
	}
	if first[0].Date != "2026-07-17" {
		t.Fatalf("expected newest-first, got %#v", first)
	}
	if err := RememberUsageUpload(first, org, device); err != nil {
		t.Fatal(err)
	}

	second := FilterUsageUploadDelta([]types.DailyUsage{today, old, tooOld}, now, org, device)
	if len(second) != 1 || second[0].Date != "2026-07-17" {
		t.Fatalf("second = %#v", second)
	}

	third := FilterUsageUploadDelta([]types.DailyUsage{today, oldChanged}, now, org, device)
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

func TestFingerprintsAreEnrollmentScoped(t *testing.T) {
	setupUsageUploadHome(t)
	now := time.Date(2026, 7, 20, 12, 0, 0, 0, time.UTC)
	row := types.DailyUsage{
		Date: "2026-07-19", ToolName: "cursor", Model: "composer-2.5",
		InputTokens: 1000, EstimatedCost: 2.87, Source: "cursor_usage_events",
	}

	if err := RememberUsageUpload([]types.DailyUsage{row}, "org-a", "device-a"); err != nil {
		t.Fatal(err)
	}
	// Same enrollment: historical row is skipped.
	pending := FilterUsageUploadDelta([]types.DailyUsage{row}, now, "org-a", "device-a")
	if len(pending) != 0 {
		t.Fatalf("same device should skip unchanged history, got %#v", pending)
	}
	// Re-enroll / new device: must re-queue (this is the Jul 15–20 data-loss bug).
	pending = FilterUsageUploadDelta([]types.DailyUsage{row}, now, "org-b", "device-b")
	if len(pending) != 1 {
		t.Fatalf("new enrollment must re-upload history, got %#v", pending)
	}
}

func TestClearUsageUploadStoreDropsFingerprints(t *testing.T) {
	setupUsageUploadHome(t)
	row := types.DailyUsage{Date: "2026-07-19", ToolName: "codex", Model: "gpt", InputTokens: 5, Source: "local_scan"}
	if err := RememberUsageUpload([]types.DailyUsage{row}, "org-a", "device-a"); err != nil {
		t.Fatal(err)
	}
	if err := ClearUsageUploadStore(); err != nil {
		t.Fatal(err)
	}
	now := time.Date(2026, 7, 20, 12, 0, 0, 0, time.UTC)
	pending := FilterUsageUploadDelta([]types.DailyUsage{row}, now, "org-a", "device-a")
	if len(pending) != 1 {
		t.Fatalf("after clear, row must be pending again, got %#v", pending)
	}
}

func TestLegacyFingerprintFileWithoutDeviceIsIgnored(t *testing.T) {
	setupUsageUploadHome(t)
	// Simulate pre-fix usage-upload.json with fingerprints but no device binding.
	legacy := map[string]any{
		"fingerprints": map[string]string{
			"cursor|2026-07-19|composer-2.5|cursor_usage_events": "in:1000,out:0,cr:0,cw:0,r:0,cost:2.870000,sug:0,acc:0,add:0,del:0,com:0,ai:,req:0,v:false,mk:",
		},
	}
	b, _ := json.Marshal(legacy)
	if err := os.WriteFile(usageUploadPath(), b, 0600); err != nil {
		t.Fatal(err)
	}
	now := time.Date(2026, 7, 20, 12, 0, 0, 0, time.UTC)
	row := types.DailyUsage{
		Date: "2026-07-19", ToolName: "cursor", Model: "composer-2.5",
		InputTokens: 1000, EstimatedCost: 2.87, Source: "cursor_usage_events",
	}
	pending := FilterUsageUploadDelta([]types.DailyUsage{row}, now, "org-new", "device-new")
	if len(pending) != 1 {
		t.Fatalf("legacy unbound fingerprints must not block new device, got %#v", pending)
	}
}
