// Package scan reads local JSONL session logs produced by AI coding tools and
// aggregates token counts and estimated cost. It never reads prompt text —
// only numeric usage metadata.
package scan

import (
	"bufio"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/usejunction/agent/internal/config"
	"github.com/usejunction/agent/internal/types"
)

// Pricing constants (USD per million tokens).
const (
	codexInputPer1M   = 2.5
	codexOutputPer1M  = 10.0
	claudeInputPer1M  = 3.0
	claudeOutputPer1M = 15.0
)

// ScanCodex walks the Codex session/archived_sessions directories.
func ScanCodex(codexHome string, refresh bool) ([]types.DailyUsage, error) {
	dirs := []string{
		filepath.Join(codexHome, "sessions"),
		filepath.Join(codexHome, "archived_sessions"),
	}
	return scanJSONLDirs("codex", dirs, parseCodexLine, refresh)
}

// ScanClaude walks the Claude projects directories.
func ScanClaude(roots []string, refresh bool) ([]types.DailyUsage, error) {
	var dirs []string
	for _, r := range roots {
		if _, err := os.Stat(r); err == nil {
			dirs = append(dirs, r)
		}
	}
	return scanJSONLDirs("claude", dirs, parseClaudeLine, refresh)
}

// lineParser extracts usage metadata from a single JSONL object.
// It returns ok=false for lines that do not contain usage data.
type lineParser func(row map[string]any) (date, model string, input, output, cacheRead int, ok bool)

func scanJSONLDirs(tool string, roots []string, parser lineParser, refresh bool) ([]types.DailyUsage, error) {
	cacheFile := filepath.Join(config.CacheDir(), tool+".json")
	if !refresh {
		if cached, err := loadCache(cacheFile); err == nil && len(cached) > 0 {
			return cached, nil
		}
	}

	// Bucket by "date|model" to produce one row per day per model.
	buckets := map[string]*types.DailyUsage{}
	// Deduplication: skip rows whose requestId+messageId we've already counted.
	seen := map[string]bool{}

	for _, root := range roots {
		_ = filepath.Walk(root, func(path string, info os.FileInfo, err error) error {
			if err != nil || info.IsDir() || !strings.HasSuffix(path, ".jsonl") {
				return nil
			}
			processFile(path, tool, parser, buckets, seen)
			return nil
		})
	}

	result := make([]types.DailyUsage, 0, len(buckets))
	for _, b := range buckets {
		b.EstimatedCost = estimateCost(tool, b.InputTokens, b.OutputTokens)
		result = append(result, *b)
	}

	_ = saveCache(cacheFile, result)
	return result, nil
}

func processFile(
	path, tool string,
	parser lineParser,
	buckets map[string]*types.DailyUsage,
	seen map[string]bool,
) {
	f, err := os.Open(path)
	if err != nil {
		return
	}
	defer f.Close()

	sc := bufio.NewScanner(f)
	sc.Buffer(make([]byte, 1<<20), 1<<20) // 1 MiB line buffer
	for sc.Scan() {
		var row map[string]any
		if json.Unmarshal(sc.Bytes(), &row) != nil {
			continue
		}

		date, model, input, output, cacheRead, ok := parser(row)
		if !ok {
			continue
		}

		// Build a dedup key from any available identifiers.
		reqID, _ := row["requestId"].(string)
		msgID := ""
		if msg, ok2 := row["message"].(map[string]any); ok2 {
			msgID, _ = msg["id"].(string)
		}
		dedupeKey := reqID + msgID
		if dedupeKey != "" {
			if seen[dedupeKey] {
				continue
			}
			seen[dedupeKey] = true
		}

		key := date + "|" + model
		if buckets[key] == nil {
			buckets[key] = &types.DailyUsage{Date: date, ToolName: tool, Model: model}
		}
		b := buckets[key]
		b.InputTokens += input
		b.OutputTokens += output
		b.CacheReadTokens += cacheRead
	}
}

func parseCodexLine(row map[string]any) (date, model string, input, output, cacheRead int, ok bool) {
	typ, _ := row["type"].(string)
	if typ != "event_msg" {
		return
	}
	msg, _ := row["msg"].(map[string]any)
	if msg == nil {
		return
	}
	tc, _ := msg["token_count"].(map[string]any)
	if tc == nil {
		return
	}
	input = intVal(tc["input_tokens"])
	output = intVal(tc["output_tokens"])
	if input+output == 0 {
		return
	}
	model, _ = row["model"].(string)
	date = time.Now().Format("2006-01-02")
	ok = true
	return
}

func parseClaudeLine(row map[string]any) (date, model string, input, output, cacheRead int, ok bool) {
	typ, _ := row["type"].(string)
	if typ != "assistant" {
		return
	}
	msg, _ := row["message"].(map[string]any)
	if msg == nil {
		return
	}
	usage, _ := msg["usage"].(map[string]any)
	if usage == nil {
		return
	}
	input = intVal(usage["input_tokens"])
	output = intVal(usage["output_tokens"])
	cacheRead = intVal(usage["cache_read_input_tokens"])
	if input+output == 0 {
		return
	}
	model, _ = msg["model"].(string)
	ts, _ := row["timestamp"].(string)
	if ts != "" {
		if t, err := time.Parse(time.RFC3339, ts); err == nil {
			date = t.Format("2006-01-02")
		}
	}
	if date == "" {
		date = time.Now().Format("2006-01-02")
	}
	ok = true
	return
}

func intVal(v any) int {
	switch n := v.(type) {
	case float64:
		return int(n)
	case int:
		return n
	}
	return 0
}

func estimateCost(tool string, input, output int) float64 {
	inRate, outRate := codexInputPer1M, codexOutputPer1M
	if tool == "claude" {
		inRate, outRate = claudeInputPer1M, claudeOutputPer1M
	}
	return (float64(input)/1e6)*inRate + (float64(output)/1e6)*outRate
}

func loadCache(path string) ([]types.DailyUsage, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var out []types.DailyUsage
	return out, json.Unmarshal(data, &out)
}

func saveCache(path string, data []types.DailyUsage) error {
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return err
	}
	b, err := json.Marshal(data)
	if err != nil {
		return err
	}
	return os.WriteFile(path, b, 0600)
}
