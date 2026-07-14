package scan

import (
	"bufio"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"

	"github.com/usejunction/agent/internal/config"
	"github.com/usejunction/agent/internal/types"
)

const calculationVersion = "usage-v2"

type tokenTuple struct {
	input, output, cacheRead, reasoning int
}

type codexSessionState struct {
	lastModel string
	prevTotal tokenTuple
}

// ScanCodex walks session logs using cumulative total_token_usage deltas.
func ScanCodex(codexHome string, refresh bool) ([]types.DailyUsage, error) {
	cacheFile := filepath.Join(config.CacheDir(), "codex.json")
	if !refresh {
		if cached, err := loadCache(cacheFile); err == nil && len(cached) > 0 {
			return cached, nil
		}
	}

	dirs := []string{
		filepath.Join(codexHome, "sessions"),
		filepath.Join(codexHome, "archived_sessions"),
	}

	buckets := map[string]*types.DailyUsage{}
	for _, root := range dirs {
		_ = filepath.Walk(root, func(path string, info os.FileInfo, err error) error {
			if err != nil || info.IsDir() || !strings.HasSuffix(path, ".jsonl") {
				return nil
			}
			processCodexFile(path, buckets)
			return nil
		})
	}

	result := make([]types.DailyUsage, 0, len(buckets))
	for _, b := range buckets {
		if b.EstimatedCost == 0 && b.MetricKind != types.MetricKindProductivity {
			b.EstimatedCost = EstimateCostForTool(
				"codex", b.Model, b.InputTokens, b.OutputTokens, b.CacheReadTokens, b.CacheWriteTokens,
			)
		}
		if b.Source == "" {
			b.Source = "local_scan"
		}
		if b.MetricKind == "" {
			b.MetricKind = types.MetricKindUsage
		}
		if b.CostKind == "" && b.EstimatedCost > 0 {
			b.CostKind = types.CostKindEstimatedAPI
		}
		if b.TokenSemantics == "" {
			b.TokenSemantics = types.TokenSemanticsOpenAI
		}
		b.CalculationVersion = calculationVersion
		result = append(result, *b)
	}

	_ = saveCache(cacheFile, result)
	return result, nil
}

func processCodexFile(path string, buckets map[string]*types.DailyUsage) {
	repository := repositoryForSessionFile(path)
	state := &codexSessionState{}

	f, err := os.Open(path)
	if err != nil {
		return
	}
	defer f.Close()

	sc := bufio.NewScanner(f)
	sc.Buffer(make([]byte, 1<<20), 1<<20)
	for sc.Scan() {
		var row map[string]any
		if json.Unmarshal(sc.Bytes(), &row) != nil {
			continue
		}
		if model := codexModelFromRow(row); model != "" {
			state.lastModel = model
		}
		hit := parseCodexCumulativeDelta(row, state)
		if !hit.ok {
			continue
		}
		if hit.model == "" {
			hit.model = state.lastModel
		}
		if hit.model == "" {
			hit.model = "unknown"
		}

		repoKey := ""
		if repository != nil {
			repoKey = repository.Host + "/" + repository.Owner + "/" + repository.Name
		}
		key := hit.date + "|" + hit.model + "|" + repoKey
		if buckets[key] == nil {
			buckets[key] = &types.DailyUsage{
				Date: hit.date, ToolName: "codex", Model: hit.model,
				Repository: repository, Source: "local_scan",
				MetricKind: types.MetricKindUsage, TokenSemantics: types.TokenSemanticsOpenAI,
			}
		}
		b := buckets[key]
		b.InputTokens += hit.input
		b.OutputTokens += hit.output
		b.CacheReadTokens += hit.cacheRead
		b.ReasoningTokens += hit.reasoning
		b.Requests++
	}
}

func parseCodexCumulativeDelta(row map[string]any, state *codexSessionState) usageHit {
	var hit usageHit
	typ, _ := row["type"].(string)
	if typ != "event_msg" {
		return hit
	}

	payload, _ := row["payload"].(map[string]any)
	if payload == nil {
		return parseCodexLegacyMsg(row)
	}
	payloadType, _ := payload["type"].(string)
	if payloadType != "token_count" {
		return hit
	}

	info, _ := payload["info"].(map[string]any)
	if info == nil {
		return hit
	}
	total := tokenTupleFromMap(info["total_token_usage"])
	if total.input+total.output == 0 {
		// Fall back to last_token_usage for older single-shot events.
		if usage, ok := info["last_token_usage"].(map[string]any); ok {
			hit.input = intVal(usage["input_tokens"])
			hit.output = intVal(usage["output_tokens"])
			hit.cacheRead = intVal(usage["cached_input_tokens"])
			hit.reasoning = intVal(usage["reasoning_output_tokens"])
			if hit.input+hit.output > 0 {
				hit.model, _ = payload["model"].(string)
				hit.date = parseCodexTimestamp(row)
				hit.ok = true
			}
		}
		return hit
	}

	delta := total
	if state.prevTotal.input+state.prevTotal.output > 0 &&
		total.input >= state.prevTotal.input && total.output >= state.prevTotal.output {
		delta = tokenTuple{
			input:     total.input - state.prevTotal.input,
			output:    total.output - state.prevTotal.output,
			cacheRead: total.cacheRead - state.prevTotal.cacheRead,
			reasoning: total.reasoning - state.prevTotal.reasoning,
		}
		if delta.input < 0 {
			delta.input = 0
		}
		if delta.output < 0 {
			delta.output = 0
		}
		if delta.cacheRead < 0 {
			delta.cacheRead = 0
		}
		if delta.reasoning < 0 {
			delta.reasoning = 0
		}
	} else if total.input < state.prevTotal.input || total.output < state.prevTotal.output {
		// Session reset — treat as fresh cumulative bucket.
		delta = total
	}
	state.prevTotal = total

	if delta.input+delta.output == 0 {
		return hit
	}

	hit.input = delta.input
	hit.output = delta.output
	hit.cacheRead = delta.cacheRead
	hit.reasoning = delta.reasoning
	hit.model, _ = payload["model"].(string)
	hit.date = parseCodexTimestamp(row)
	hit.ok = true
	return hit
}

func parseCodexLegacyMsg(row map[string]any) usageHit {
	var hit usageHit
	msg, _ := row["msg"].(map[string]any)
	if msg == nil {
		return hit
	}
	tc, _ := msg["token_count"].(map[string]any)
	if tc == nil {
		return hit
	}
	hit.input = intVal(tc["input_tokens"])
	hit.output = intVal(tc["output_tokens"])
	hit.cacheRead = intVal(tc["cached_input_tokens"])
	hit.reasoning = intVal(tc["reasoning_output_tokens"])
	if hit.input+hit.output == 0 {
		return hit
	}
	hit.model, _ = row["model"].(string)
	hit.date = parseCodexTimestamp(row)
	hit.ok = true
	return hit
}

func tokenTupleFromMap(v any) tokenTuple {
	m, _ := v.(map[string]any)
	if m == nil {
		return tokenTuple{}
	}
	return tokenTuple{
		input:     intVal(m["input_tokens"]),
		output:    intVal(m["output_tokens"]),
		cacheRead: intVal(m["cached_input_tokens"]),
		reasoning: intVal(m["reasoning_output_tokens"]),
	}
}
