package providers_test

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/usejunction/agent/internal/platformdirs"
	"github.com/usejunction/agent/internal/providers"
	"github.com/usejunction/agent/internal/workextract"
)

func TestAntigravityLiveDetectSmoke(t *testing.T) {
	if os.Getenv("UJ_LIVE_ANTIGRAVITY") != "1" {
		t.Skip("set UJ_LIVE_ANTIGRAVITY=1 to run against local Antigravity state")
	}
	state := filepath.Join(platformdirs.AntigravityUserDir(), "globalStorage", "state.vscdb")
	if _, err := os.Stat(state); err != nil {
		t.Skip("Antigravity state.vscdb not present on this machine")
	}
	p := &providers.AntigravityProvider{}
	st, err := p.Detect(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if st == nil || !st.Detected {
		t.Fatalf("expected detected, got %#v", st)
	}
	acc, err := p.AccountIdentity(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if acc == nil || !acc.AuthPresent {
		t.Fatalf("expected auth present, got %#v", acc)
	}
	if acc.Plan == "" && acc.Email == "" {
		t.Fatalf("expected plan or email from local state, got %#v", acc)
	}
	quotas, err := p.ProbeQuota(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	hasPercent := false
	for _, q := range quotas {
		t.Logf("quota window=%s used=%v reset=%v credits=%v source=%s", q.WindowType, q.UsedPercent, q.ResetAt, q.CreditsRemaining, q.Source)
		if q.UsedPercent != nil {
			hasPercent = true
		}
	}
	if !hasPercent {
		t.Fatal("expected Antigravity Cloud Code usedPercent windows for pace")
	}
	usage, err := p.ScanLocalUsage(context.Background(), true)
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("detect=%+v plan=%q email=%q usageRows=%d", st, acc.Plan, acc.Email, len(usage))
	hasTokens := false
	for _, row := range usage {
		t.Logf("usage model=%s req=%d in=%d out=%d cache=%d cost=%.6f source=%s kind=%s",
			row.Model, row.Requests, row.InputTokens, row.OutputTokens, row.CacheReadTokens, row.EstimatedCost, row.Source, row.CostKind)
		if row.InputTokens+row.OutputTokens > 0 && row.EstimatedCost > 0 {
			hasTokens = true
		}
	}
	if !hasTokens {
		t.Fatal("expected at least one Antigravity usage row with tokens + estimated cost when LS is available")
	}

	sessions := workextract.Collect(workextract.Options{})
	count := 0
	for _, s := range sessions {
		if s.ToolName == "antigravity" {
			count++
		}
	}
	t.Logf("antigravity work sessions=%d", count)
}
