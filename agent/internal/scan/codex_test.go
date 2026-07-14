package scan

import "testing"

func TestParseCodexCumulativeDeltaIgnoresRepeatedSnapshots(t *testing.T) {
	state := &codexSessionState{}
	row1 := map[string]any{
		"type": "event_msg",
		"timestamp": "2026-07-03T12:00:00Z",
		"payload": map[string]any{
			"type": "token_count",
			"model": "gpt-5.2",
			"info": map[string]any{
				"total_token_usage": map[string]any{
					"input_tokens": float64(100), "output_tokens": float64(10),
				},
			},
		},
	}
	row2 := map[string]any{
		"type": "event_msg",
		"timestamp": "2026-07-03T12:00:01Z",
		"payload": map[string]any{
			"type": "token_count",
			"model": "gpt-5.2",
			"info": map[string]any{
				"total_token_usage": map[string]any{
					"input_tokens": float64(100), "output_tokens": float64(10),
				},
			},
		},
	}
	row3 := map[string]any{
		"type": "event_msg",
		"timestamp": "2026-07-03T12:00:02Z",
		"payload": map[string]any{
			"type": "token_count",
			"model": "gpt-5.2",
			"info": map[string]any{
				"total_token_usage": map[string]any{
					"input_tokens": float64(150), "output_tokens": float64(20),
				},
			},
		},
	}

	h1 := parseCodexCumulativeDelta(row1, state)
	h2 := parseCodexCumulativeDelta(row2, state)
	h3 := parseCodexCumulativeDelta(row3, state)
	if !h1.ok || h1.input != 100 || h1.output != 10 {
		t.Fatalf("first delta: %#v", h1)
	}
	if h2.ok {
		t.Fatalf("repeated snapshot should not count again: %#v", h2)
	}
	if !h3.ok || h3.input != 50 || h3.output != 10 {
		t.Fatalf("second delta: %#v", h3)
	}
}

func TestBillableInputTokensOpenAI(t *testing.T) {
	if got := BillableInputTokens("codex", 1000, 400); got != 600 {
		t.Fatalf("expected 600 uncached input, got %d", got)
	}
}

func TestEstimateCostForToolUsesUncachedInput(t *testing.T) {
	cached := EstimateCostForTool("codex", "gpt-5", 1_000_000, 0, 400_000, 0)
	doubleCharged := (float64(1_000_000)/1e6)*1.25 + (float64(400_000)/1e6)*0.125
	if cached >= doubleCharged-0.001 {
		t.Fatalf("should not bill full input plus cache read: cached=%f double=%f", cached, doubleCharged)
	}
}
