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

const (
	codexInputCost   = 2.5
	codexOutputCost  = 10.0
	claudeInputCost  = 3.0
	claudeOutputCost = 15.0
)

func ScanCodex(codexHome string, refresh bool) ([]types.DailyUsage, error) {
	paths := []string{
		filepath.Join(codexHome, "sessions"),
		filepath.Join(codexHome, "archived_sessions"),
	}
	return scanJSONLDirs("codex", paths, parseCodexLine, refresh)
}

func ScanClaude(roots []string, refresh bool) ([]types.DailyUsage, error) {
	var paths []string
	for _, root := range roots {
		if _, err := os.Stat(root); err == nil {
			paths = append(paths, root)
		}
	}
	return scanJSONLDirs("claude", paths, parseClaudeLine, refresh)
}

type lineParser func(map[string]any) (date, model string, input, output, cacheRead int, ok bool)

func scanJSONLDirs(tool string, roots []string, parser lineParser, refresh bool) ([]types.DailyUsage, error) {
	cacheFile := filepath.Join(config.CacheDir(), tool+".json")
	if !refresh {
		if cached, err := loadCache(cacheFile); err == nil && len(cached) > 0 {
			return cached, nil
		}
	}

	buckets := map[string]*types.DailyUsage{}
	seen := map[string]bool{}

	for _, root := range roots {
		_ = filepath.Walk(root, func(path string, info os.FileInfo, err error) error {
			if err != nil || info.IsDir() || !strings.HasSuffix(path, ".jsonl") {
				return nil
			}
			f, err := os.Open(path)
			if err != nil {
				return nil
			}
			defer f.Close()
			scanner := bufio.NewScanner(f)
			scanner.Buffer(make([]byte, 1024*1024), 1024*1024)
			for scanner.Scan() {
				var row map[string]any
				if json.Unmarshal(scanner.Bytes(), &row) != nil {
					continue
				}
				date, model, input, output, cacheRead, ok := parser(row)
				if !ok {
					continue
				}
				msgID := ""
				reqID, _ := row["requestId"].(string)
				if msg, ok := row["message"].(map[string]any); ok {
					msgID, _ = msg["id"].(string)
				}
				dedupeKey := msgID + reqID
				if dedupeKey != "" && seen[dedupeKey] {
					continue
				}
				if dedupeKey != "" {
					seen[dedupeKey] = true
				}
				key := date + "|" + model
				if buckets[key] == nil {
					buckets[key] = &types.DailyUsage{Date: date, ToolName: tool, Model: model}
				}
				buckets[key].InputTokens += input
				buckets[key].OutputTokens += output
				buckets[key].CacheReadTokens += cacheRead
			}
			return nil
		})
	}

	var result []types.DailyUsage
	for _, b := range buckets {
		b.EstimatedCost = estimateCost(tool, b.InputTokens, b.OutputTokens)
		result = append(result, *b)
	}

	_ = saveCache(cacheFile, result)
	return result, nil
}

func parseCodexLine(row map[string]any) (date, model string, input, output, cacheRead int, ok bool) {
	if typ, _ := row["type"].(string); typ == "event_msg" {
		if msg, ok2 := row["msg"].(map[string]any); ok2 {
			if tc, ok3 := msg["token_count"].(map[string]any); ok3 {
				input = intVal(tc["input_tokens"])
				output = intVal(tc["output_tokens"])
				model, _ = row["model"].(string)
				date = time.Now().Format("2006-01-02")
				return date, model, input, output, 0, input+output > 0
			}
		}
	}
	return "", "", 0, 0, 0, false
}

func parseClaudeLine(row map[string]any) (date, model string, input, output, cacheRead int, ok bool) {
	typ, _ := row["type"].(string)
	if typ != "assistant" {
		return "", "", 0, 0, 0, false
	}
	msg, _ := row["message"].(map[string]any)
	if msg == nil {
		return "", "", 0, 0, 0, false
	}
	usage, _ := msg["usage"].(map[string]any)
	if usage == nil {
		return "", "", 0, 0, 0, false
	}
	input = intVal(usage["input_tokens"])
	output = intVal(usage["output_tokens"])
	cacheRead = intVal(usage["cache_read_input_tokens"])
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
	return date, model, input, output, cacheRead, input+output > 0
}

func intVal(v any) int {
	switch n := v.(type) {
	case float64:
		return int(n)
	case int:
		return n
	default:
		return 0
	}
}

func estimateCost(tool string, input, output int) float64 {
	inCost, outCost := codexInputCost, codexOutputCost
	if tool == "claude" {
		inCost, outCost = claudeInputCost, claudeOutputCost
	}
	return (float64(input)/1e6)*inCost + (float64(output)/1e6)*outCost
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
	_ = os.MkdirAll(filepath.Dir(path), 0700)
	b, err := json.Marshal(data)
	if err != nil {
		return err
	}
	return os.WriteFile(path, b, 0600)
}
