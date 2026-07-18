package client

import "testing"

func TestChunkUsageAggregates(t *testing.T) {
	makeAggs := func(n int) []UsageAggregate {
		out := make([]UsageAggregate, n)
		for i := range out {
			out[i] = UsageAggregate{Date: "2026-07-17", ToolName: "codex", Model: "test"}
		}
		return out
	}

	cases := []struct {
		name       string
		count      int
		batchSize  int
		wantBatches int
		wantLastLen int
	}{
		{name: "empty", count: 0, batchSize: 1000, wantBatches: 0},
		{name: "exact_one_batch", count: 1000, batchSize: 1000, wantBatches: 1, wantLastLen: 1000},
		{name: "one_over", count: 1001, batchSize: 1000, wantBatches: 2, wantLastLen: 1},
		{name: "two_and_a_half", count: 2500, batchSize: 1000, wantBatches: 3, wantLastLen: 500},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			batches := chunkUsageAggregates(makeAggs(tc.count), tc.batchSize)
			if len(batches) != tc.wantBatches {
				t.Fatalf("batches = %d, want %d", len(batches), tc.wantBatches)
			}
			total := 0
			for i, batch := range batches {
				if len(batch) == 0 {
					t.Fatalf("batch %d is empty", i)
				}
				if i < len(batches)-1 && len(batch) != tc.batchSize {
					t.Fatalf("batch %d len = %d, want %d", i, len(batch), tc.batchSize)
				}
				if i == len(batches)-1 && len(batch) != tc.wantLastLen {
					t.Fatalf("last batch len = %d, want %d", len(batch), tc.wantLastLen)
				}
				total += len(batch)
			}
			if total != tc.count {
				t.Fatalf("total rows = %d, want %d", total, tc.count)
			}
		})
	}
}
