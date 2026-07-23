package client

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
)


func TestChunkUsageAggregatesByCount(t *testing.T) {
	makeAggs := func(n int) []UsageAggregate {
		out := make([]UsageAggregate, n)
		for i := range out {
			out[i] = UsageAggregate{Date: "2026-07-17", ToolName: "codex", Model: "test"}
		}
		return out
	}

	cases := []struct {
		name        string
		count       int
		maxRows     int
		wantBatches int
		wantLastLen int
	}{
		{name: "empty", count: 0, maxRows: 1000, wantBatches: 0},
		{name: "exact_one_batch", count: 1000, maxRows: 1000, wantBatches: 1, wantLastLen: 1000},
		{name: "one_over", count: 1001, maxRows: 1000, wantBatches: 2, wantLastLen: 1},
		{name: "two_and_a_half", count: 2500, maxRows: 1000, wantBatches: 3, wantLastLen: 500},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			// Large byte budget so only the row cap applies.
			batches := chunkUsageAggregates(makeAggs(tc.count), tc.maxRows, 10*1024*1024)
			if len(batches) != tc.wantBatches {
				t.Fatalf("batches = %d, want %d", len(batches), tc.wantBatches)
			}
			total := 0
			for i, batch := range batches {
				if len(batch) == 0 {
					t.Fatalf("batch %d is empty", i)
				}
				if i < len(batches)-1 && len(batch) != tc.maxRows {
					t.Fatalf("batch %d len = %d, want %d", i, len(batch), tc.maxRows)
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

func TestChunkUsageAggregatesByBytes(t *testing.T) {
	makeDense := func(n int) []UsageAggregate {
		out := make([]UsageAggregate, n)
		for i := range out {
			out[i] = UsageAggregate{
				Date:             "2026-07-17",
				ToolName:         "codex",
				Model:            "gpt-5.4-mini-with-a-long-model-name-suffix",
				InputTokens:      1_900_000 + i,
				OutputTokens:     140_000 + i,
				CacheReadTokens:  500_000 + i,
				CacheWriteTokens: 10_000 + i,
				EstimatedCost:    11.0633555,
				Requests:         161,
				Source:           "local_scan",
				CostKind:         "estimated_api",
				Metadata: map[string]any{
					"note": strings.Repeat("x", 200),
				},
			}
		}
		return out
	}

	const maxRows = 1000
	const maxBytes = 8 * 1024 // force byte splits well below row cap
	rows := makeDense(80)
	batches := chunkUsageAggregates(rows, maxRows, maxBytes)
	if len(batches) < 2 {
		t.Fatalf("expected byte-limited split into multiple batches, got %d", len(batches))
	}

	total := 0
	for i, batch := range batches {
		if len(batch) == 0 {
			t.Fatalf("batch %d is empty", i)
		}
		if len(batch) > maxRows {
			t.Fatalf("batch %d has %d rows, exceeds maxRows %d", i, len(batch), maxRows)
		}
		payload, err := json.Marshal(map[string]any{"aggregates": batch})
		if err != nil {
			t.Fatalf("marshal batch %d: %v", i, err)
		}
		if len(payload) > maxBytes && len(batch) > 1 {
			t.Fatalf("batch %d payload %d exceeds maxBytes %d with %d rows", i, len(payload), maxBytes, len(batch))
		}
		total += len(batch)
	}
	if total != len(rows) {
		t.Fatalf("total rows = %d, want %d", total, len(rows))
	}
}

func TestChunkUsageAggregatesOversizedRowAlone(t *testing.T) {
	huge := UsageAggregate{
		Date:     "2026-07-17",
		ToolName: "codex",
		Model:    "huge",
		Metadata: map[string]any{"blob": strings.Repeat("y", 8*1024)},
	}
	small := UsageAggregate{Date: "2026-07-17", ToolName: "codex", Model: "small"}
	batches := chunkUsageAggregates([]UsageAggregate{small, huge, small}, 1000, 4*1024)
	if len(batches) < 3 {
		t.Fatalf("expected oversized row flushed alone, got %d batches", len(batches))
	}
	foundAlone := false
	for _, batch := range batches {
		if len(batch) == 1 && batch[0].Model == "huge" {
			foundAlone = true
		}
	}
	if !foundAlone {
		t.Fatal("oversized row was not sent in its own batch")
	}
}

func TestReportLocalUsageBisectsOn413(t *testing.T) {
	var posts atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/ingest/local-usage" {
			http.NotFound(w, r)
			return
		}
		posts.Add(1)
		var body struct {
			Aggregates []UsageAggregate `json:"aggregates"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "bad json", 400)
			return
		}
		// Reject multi-row posts; accept singles so bisect can succeed.
		if len(body.Aggregates) > 1 {
			http.Error(w, `{"error":"request body too large"}`, http.StatusRequestEntityTooLarge)
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"upserted": len(body.Aggregates)})
	}))
	defer server.Close()

	api := &APIClient{
		baseURL: server.URL,
		token:   "tok",
		http:    server.Client(),
	}
	rows := []UsageAggregate{
		{Date: "2026-07-20", ToolName: "codex", Model: "a", Source: "local_scan"},
		{Date: "2026-07-20", ToolName: "codex", Model: "b", Source: "local_scan"},
		{Date: "2026-07-20", ToolName: "codex", Model: "c", Source: "local_scan"},
		{Date: "2026-07-20", ToolName: "codex", Model: "d", Source: "local_scan"},
	}
	if err := api.ReportLocalUsage(rows); err != nil {
		t.Fatalf("ReportLocalUsage: %v", err)
	}
	if posts.Load() < 4 {
		t.Fatalf("expected bisect down to single-row POSTs, got %d posts", posts.Load())
	}
}

func TestReportLocalUsageSingleRow413(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, `{"error":"request body too large"}`, http.StatusRequestEntityTooLarge)
	}))
	defer server.Close()

	api := &APIClient{
		baseURL: server.URL,
		token:   "tok",
		http:    server.Client(),
	}
	err := api.ReportLocalUsage([]UsageAggregate{
		{Date: "2026-07-20", ToolName: "codex", Model: "huge", Source: "local_scan"},
	})
	if err == nil {
		t.Fatal("expected 413 error for single oversized row")
	}
	if !isPayloadTooLarge(err) {
		t.Fatalf("want payload-too-large error, got %v", err)
	}
}

func TestIsPayloadTooLarge(t *testing.T) {
	if !isPayloadTooLarge(fmt.Errorf(`POST /api/ingest/local-usage returned 413: {"error":"request body too large"}`)) {
		t.Fatal("413 status should match")
	}
	if isPayloadTooLarge(fmt.Errorf("POST /api/ingest/local-usage returned 500: boom")) {
		t.Fatal("500 should not match")
	}
}
