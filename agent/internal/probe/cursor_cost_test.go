package probe

import (
	"testing"

	"github.com/usejunction/agent/internal/types"
)

func TestFinalizeCursorEventCostUsesVerifiedWhenCharged(t *testing.T) {
	b := &types.DailyUsage{
		Model:         "composer-2.5-fast",
		InputTokens:   1_000_000,
		OutputTokens:  500_000,
		EstimatedCost: 1.25,
	}
	finalizeCursorEventCost(b)
	if !b.Verified || b.CostKind != types.CostKindVerifiedUsage || b.EstimatedCost != 1.25 {
		t.Fatalf("unexpected verified bucket: verified=%v kind=%s cost=%f", b.Verified, b.CostKind, b.EstimatedCost)
	}
}

func TestFinalizeCursorEventCostEstimatesIncludedUsage(t *testing.T) {
	b := &types.DailyUsage{
		Model:         "composer-2.5-fast",
		InputTokens:   1_000_000,
		OutputTokens:  500_000,
		EstimatedCost: 0,
	}
	finalizeCursorEventCost(b)
	if b.Verified || b.CostKind != types.CostKindEstimatedAPI || b.EstimatedCost < 10.4 || b.EstimatedCost > 10.6 {
		t.Fatalf("unexpected estimated bucket: verified=%v kind=%s cost=%f", b.Verified, b.CostKind, b.EstimatedCost)
	}
}

func TestFinalizeCursorEventCostEstimatesGrokFastIncludedUsage(t *testing.T) {
	b := &types.DailyUsage{
		Model:         "cursor-grok-4.5-high-fast",
		InputTokens:   1_000_000,
		OutputTokens:  1_000_000,
		EstimatedCost: 0,
	}
	finalizeCursorEventCost(b)
	if b.Verified || b.CostKind != types.CostKindEstimatedAPI || b.EstimatedCost < 21.9 || b.EstimatedCost > 22.1 {
		t.Fatalf("unexpected grok fast bucket: verified=%v kind=%s cost=%f", b.Verified, b.CostKind, b.EstimatedCost)
	}
}

func TestFinalizeCursorEventCostUsesStandardComposerNotFast(t *testing.T) {
	b := &types.DailyUsage{
		Model:         "composer-2.5",
		InputTokens:   1_000_000,
		OutputTokens:  1_000_000,
		EstimatedCost: 0,
	}
	finalizeCursorEventCost(b)
	if b.CostKind != types.CostKindEstimatedAPI || b.EstimatedCost < 2.9 || b.EstimatedCost > 3.1 {
		t.Fatalf("unexpected standard composer bucket: kind=%s cost=%f", b.CostKind, b.EstimatedCost)
	}
}

func TestFinalizeCursorEventCostLeavesZeroWithoutTokens(t *testing.T) {
	b := &types.DailyUsage{
		Model:         "composer-2.5-fast",
		EstimatedCost: 0,
	}
	finalizeCursorEventCost(b)
	if b.EstimatedCost != 0 || b.CostKind != "" || b.Verified {
		t.Fatalf("expected empty zero bucket: verified=%v kind=%s cost=%f", b.Verified, b.CostKind, b.EstimatedCost)
	}
}
