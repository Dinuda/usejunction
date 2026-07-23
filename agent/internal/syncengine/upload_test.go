package syncengine

import (
	"testing"

	"github.com/usejunction/agent/internal/types"
	"github.com/usejunction/agent/internal/uus"
)

func TestUsageToAggregateRoundTripShape(t *testing.T) {
	row := types.DailyUsage{
		Date: "2026-07-21", ToolName: "codex", Model: "gpt-5",
		InputTokens: 11, OutputTokens: 3, EstimatedCost: 1.25, Requests: 2,
		Source: "local_scan",
		Repository: &types.RepositoryIdentity{Host: "github.com", Owner: "acme", Name: "app"},
	}
	agg := usageToAggregate(row)
	if agg.ToolName != "codex" || agg.InputTokens != 11 || agg.Repository == nil || agg.Repository.Owner != "acme" {
		t.Fatalf("unexpected aggregate: %+v", agg)
	}
	manifest := uus.BuildManifest([]types.DailyUsage{row})
	if len(manifest) != 1 {
		t.Fatalf("expected 1 manifest entry, got %d", len(manifest))
	}
	if manifest[0].PartitionKey == "" || manifest[0].ContentHash == "" {
		t.Fatalf("empty partition/hash: %+v", manifest[0])
	}
}
