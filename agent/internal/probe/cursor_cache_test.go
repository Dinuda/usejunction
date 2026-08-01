package probe

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/usejunction/agent/internal/config"
	"github.com/usejunction/agent/internal/scan"
	"github.com/usejunction/agent/internal/types"
)

func TestCursorEventsCachePathUsesProfileCacheDir(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("USEJUNCTION_PROFILE", "test")

	got := cursorEventsCachePath()
	want := filepath.Join(config.CacheDir(), "cursor-usage-events.json")
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
	if !stringsHasPrefix(got, filepath.Join(home, ".usejunction-test")) {
		t.Fatalf("expected test profile path, got %q", got)
	}
}

func TestNeedsCursorEventsRebuildDetectsStaleVerifiedZeroRows(t *testing.T) {
	today := time.Now().UTC().Format("2006-01-02")
	snap := scan.ScanSnapshot{
		Aggregates: []types.DailyUsage{
			{
				Date: today, ToolName: "cursor", Source: cursorEventsSource, Model: "composer-2.5",
				InputTokens: 1_000_000, CostKind: types.CostKindVerifiedUsage, EstimatedCost: 0,
			},
		},
	}
	if !needsCursorEventsRebuild(snap) {
		t.Fatal("expected stale row to trigger rebuild")
	}
	snap.Aggregates[0].CostKind = types.CostKindEstimatedAPI
	snap.Aggregates[0].EstimatedCost = 3.5
	if needsCursorEventsRebuild(snap) {
		t.Fatal("estimated row should not trigger rebuild")
	}
}

func TestLoadCursorEventsCacheRejectsStaleVersion(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "cursor-usage-events.json")
	stale := cursorEventsCache{
		Version:            "2",
		CalculationVersion: cursorEventsCalcVersion,
		PricingVersion:     "2026-07-15",
		Rows: []types.DailyUsage{
			{ToolName: "cursor", Source: cursorEventsSource, Model: "composer-2.5", InputTokens: 1},
		},
	}
	data, err := json.Marshal(stale)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, data, 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := loadCursorEventsCache(path); err == nil {
		t.Fatal("expected version mismatch error")
	}
}

func TestFinalizeCursorEventRowsUpgradesStaleCacheRows(t *testing.T) {
	rows := []types.DailyUsage{
		{
			Model:         "composer-2.5-fast",
			InputTokens:   1_000_000,
			OutputTokens:  500_000,
			CostKind:      types.CostKindVerifiedUsage,
			EstimatedCost: 0,
		},
	}
	out := finalizeCursorEventRows(rows)
	if out[0].CostKind != types.CostKindEstimatedAPI || out[0].EstimatedCost < 10.4 || out[0].EstimatedCost > 10.6 {
		t.Fatalf("unexpected finalized row: kind=%s cost=%f", out[0].CostKind, out[0].EstimatedCost)
	}
}

func stringsHasPrefix(s, prefix string) bool {
	return len(s) >= len(prefix) && s[:len(prefix)] == prefix
}
