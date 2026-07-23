package uus

import (
	"testing"

	"github.com/usejunction/agent/internal/types"
)

func TestFromDailyUsageAndManifest(t *testing.T) {
	rows := []types.DailyUsage{
		{
			Date: "2026-07-21", ToolName: "codex", Model: "gpt-5", Source: "local_scan",
			InputTokens: 10, OutputTokens: 2, EstimatedCost: 1.25, Requests: 1,
			Repository: &types.RepositoryIdentity{Host: "github.com", Owner: "acme", Name: "app"},
		},
		{
			Date: "2026-07-21", ToolName: "codex", Model: "gpt-5", Source: "local_scan",
			InputTokens: 20, OutputTokens: 4, EstimatedCost: 2.5, Requests: 2,
			Repository: &types.RepositoryIdentity{Host: "github.com", Owner: "acme", Name: "app"},
		},
	}
	rec := FromDailyUsage(rows[0])
	if rec.SchemaVersion != SchemaVersion || rec.Tool != "codex" {
		t.Fatalf("unexpected record: %+v", rec)
	}
	manifest := BuildManifest(rows)
	if len(manifest) != 1 {
		t.Fatalf("expected 1 partition, got %d", len(manifest))
	}
	if manifest[0].ContentHash == "" || !contains(manifest[0].PartitionKey, "codex") {
		t.Fatalf("bad manifest entry: %+v", manifest[0])
	}
}

func contains(s, sub string) bool {
	return len(s) >= len(sub) && (s == sub || len(sub) == 0 || (len(s) > 0 && (stringIndex(s, sub) >= 0)))
}

func stringIndex(s, sub string) int {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return i
		}
	}
	return -1
}
