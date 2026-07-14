// Package scan reads local JSONL session logs produced by AI coding tools and
// aggregates token counts and estimated cost. It never reads prompt text —
// only numeric usage metadata.
package scan

import (
	"bufio"
	"encoding/json"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/usejunction/agent/internal/config"
	"github.com/usejunction/agent/internal/types"
)

// usageHit is one parsed usage observation from a session line.
type usageHit struct {
	date, model                  string
	input, output, cacheRead     int
	cacheWrite, reasoning        int
	ok                           bool
}

// lineParser extracts usage metadata from a single JSONL object.
type lineParser func(row map[string]any) usageHit

// ScanCodex is implemented in codex.go using cumulative deltas.

// ScanClaude walks the Claude projects directories, falling back to stats-cache.
func ScanClaude(roots []string, refresh bool) ([]types.DailyUsage, error) {
	var dirs []string
	for _, r := range roots {
		if _, err := os.Stat(r); err == nil {
			dirs = append(dirs, r)
		}
	}
	rows, err := scanJSONLDirs("claude", dirs, parseClaudeLine, refresh)
	if err != nil {
		return nil, err
	}
	if len(rows) > 0 {
		return rows, nil
	}
	// Fallback: Claude's own stats-cache.json (per-model lifetime + daily totals).
	for _, root := range roots {
		cachePath := filepath.Join(filepath.Dir(root), "stats-cache.json")
		if filepath.Base(root) != "projects" {
			continue
		}
		if fallback, ferr := scanClaudeStatsCache(cachePath); ferr == nil && len(fallback) > 0 {
			return fallback, nil
		}
	}
	home, _ := os.UserHomeDir()
	for _, p := range []string{
		filepath.Join(home, ".claude", "stats-cache.json"),
		filepath.Join(home, ".config", "claude", "stats-cache.json"),
	} {
		if fallback, ferr := scanClaudeStatsCache(p); ferr == nil && len(fallback) > 0 {
			return fallback, nil
		}
	}
	return rows, nil
}

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
			processFile(path, tool, parser, buckets, seen)
			return nil
		})
	}

	result := make([]types.DailyUsage, 0, len(buckets))
	for _, b := range buckets {
		if b.EstimatedCost == 0 {
			b.EstimatedCost = EstimateCostForTool(tool, b.Model, b.InputTokens, b.OutputTokens, b.CacheReadTokens, b.CacheWriteTokens)
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
		if tool == "claude" {
			b.TokenSemantics = types.TokenSemanticsAnthropic
		} else if b.TokenSemantics == "" {
			b.TokenSemantics = types.TokenSemanticsOpenAI
		}
		b.CalculationVersion = calculationVersion
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
	repository := repositoryForSessionFile(path)
	f, err := os.Open(path)
	if err != nil {
		return
	}
	defer f.Close()

	lastModel := ""
	sc := bufio.NewScanner(f)
	sc.Buffer(make([]byte, 1<<20), 1<<20)
	for sc.Scan() {
		var row map[string]any
		if json.Unmarshal(sc.Bytes(), &row) != nil {
			continue
		}

		if tool == "codex" {
			if model := codexModelFromRow(row); model != "" {
				lastModel = model
			}
		}

		hit := parser(row)
		if !hit.ok {
			continue
		}
		if hit.model == "" {
			hit.model = lastModel
		}

		reqID, _ := row["requestId"].(string)
		msgID := ""
		if msg, ok2 := row["message"].(map[string]any); ok2 {
			msgID, _ = msg["id"].(string)
		}
		if payload, ok2 := row["payload"].(map[string]any); ok2 && msgID == "" {
			msgID, _ = payload["id"].(string)
		}
		dedupeKey := reqID + msgID + hit.date + hit.model + "|" +
			strconv.Itoa(hit.input) + "|" + strconv.Itoa(hit.output) + "|" + strconv.Itoa(hit.cacheRead)
		if dedupeKey != "|||" {
			if seen[dedupeKey] {
				continue
			}
			seen[dedupeKey] = true
		}

		repoKey := ""
		if repository != nil {
			repoKey = repository.Host + "/" + repository.Owner + "/" + repository.Name
		}
		key := hit.date + "|" + hit.model + "|" + repoKey
		if buckets[key] == nil {
			buckets[key] = &types.DailyUsage{
				Date: hit.date, ToolName: tool, Model: hit.model,
				Repository: repository, Source: "local_scan",
			}
		}
		b := buckets[key]
		b.InputTokens += hit.input
		b.OutputTokens += hit.output
		b.CacheReadTokens += hit.cacheRead
		b.CacheWriteTokens += hit.cacheWrite
		b.ReasoningTokens += hit.reasoning
		b.Requests++
	}
}

func codexModelFromRow(row map[string]any) string {
	if typ, _ := row["type"].(string); typ == "turn_context" {
		if payload, ok := row["payload"].(map[string]any); ok {
			if model, _ := payload["model"].(string); model != "" {
				return model
			}
		}
	}
	if model, _ := row["model"].(string); model != "" {
		return model
	}
	return ""
}

func parseCodexLine(row map[string]any) usageHit {
	var hit usageHit
	typ, _ := row["type"].(string)
	if typ != "event_msg" {
		return hit
	}

	if payload, okPayload := row["payload"].(map[string]any); okPayload {
		payloadType, _ := payload["type"].(string)
		if payloadType == "token_count" {
			info, _ := payload["info"].(map[string]any)
			usage, _ := info["last_token_usage"].(map[string]any)
			if usage == nil {
				// Avoid double-counting cumulative totals when last_token_usage is absent.
				return hit
			}
			hit.input = intVal(usage["input_tokens"])
			hit.output = intVal(usage["output_tokens"])
			hit.cacheRead = intVal(usage["cached_input_tokens"])
			hit.reasoning = intVal(usage["reasoning_output_tokens"])
			if hit.input+hit.output == 0 {
				return hit
			}
			hit.model, _ = payload["model"].(string)
			if hit.model == "" {
				hit.model, _ = row["model"].(string)
			}
			hit.date = parseCodexTimestamp(row)
			hit.ok = true
			return hit
		}
	}

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

func parseCodexTimestamp(row map[string]any) string {
	ts, _ := row["timestamp"].(string)
	if ts != "" {
		if parsed, err := time.Parse(time.RFC3339Nano, ts); err == nil {
			return parsed.Format("2006-01-02")
		}
		if parsed, err := time.Parse(time.RFC3339, ts); err == nil {
			return parsed.Format("2006-01-02")
		}
	}
	return time.Now().Format("2006-01-02")
}

func repositoryForSessionFile(path string) *types.RepositoryIdentity {
	f, err := os.Open(path)
	if err != nil {
		return nil
	}
	defer f.Close()
	scanner := bufio.NewScanner(f)
	scanner.Buffer(make([]byte, 64*1024), 1024*1024)
	for lines := 0; lines < 200 && scanner.Scan(); lines++ {
		var row map[string]any
		if json.Unmarshal(scanner.Bytes(), &row) != nil {
			continue
		}
		cwd := stringField(row, "cwd")
		if payload, ok := row["payload"].(map[string]any); ok && cwd == "" {
			cwd = stringField(payload, "cwd")
		}
		if cwd == "" || isPrivacyProtectedPath(cwd) {
			continue
		}
		command := exec.Command("git", "-C", cwd, "config", "--get", "remote.origin.url")
		remote, err := command.Output()
		if err != nil {
			return nil
		}
		return normalizeRemote(strings.TrimSpace(string(remote)))
	}
	return nil
}

func isPrivacyProtectedPath(path string) bool {
	home, err := os.UserHomeDir()
	if err != nil || home == "" {
		return false
	}
	abs := path
	if !filepath.IsAbs(abs) {
		abs = filepath.Join(home, abs)
	}
	abs = filepath.Clean(abs)
	protected := []string{
		filepath.Join(home, "Documents"),
		filepath.Join(home, "Downloads"),
		filepath.Join(home, "Desktop"),
		filepath.Join(home, "Movies"),
		filepath.Join(home, "Music"),
		filepath.Join(home, "Pictures"),
	}
	for _, root := range protected {
		if abs == root || strings.HasPrefix(abs, root+string(os.PathSeparator)) {
			return true
		}
	}
	return false
}

func stringField(row map[string]any, key string) string {
	value, _ := row[key].(string)
	return value
}

func normalizeRemote(remote string) *types.RepositoryIdentity {
	if remote == "" {
		return nil
	}
	if strings.HasPrefix(remote, "git@") && strings.Contains(remote, ":") {
		parts := strings.SplitN(strings.TrimPrefix(remote, "git@"), ":", 2)
		return repositoryParts(parts[0], parts[1])
	}
	parsed, err := url.Parse(remote)
	if err != nil || parsed.Hostname() == "" {
		return nil
	}
	return repositoryParts(strings.ToLower(parsed.Hostname()), strings.TrimPrefix(parsed.Path, "/"))
}

func repositoryParts(host, path string) *types.RepositoryIdentity {
	path = strings.TrimSuffix(strings.TrimSuffix(path, "/"), ".git")
	parts := strings.Split(path, "/")
	if host == "" || len(parts) < 2 {
		return nil
	}
	owner := parts[len(parts)-2]
	name := parts[len(parts)-1]
	if owner == "" || name == "" {
		return nil
	}
	return &types.RepositoryIdentity{Host: strings.ToLower(host), Owner: owner, Name: name}
}

func parseClaudeLine(row map[string]any) usageHit {
	var hit usageHit
	typ, _ := row["type"].(string)
	if typ != "assistant" {
		return hit
	}
	msg, _ := row["message"].(map[string]any)
	if msg == nil {
		return hit
	}
	usage, _ := msg["usage"].(map[string]any)
	if usage == nil {
		return hit
	}
	hit.input = intVal(usage["input_tokens"])
	hit.output = intVal(usage["output_tokens"])
	hit.cacheRead = intVal(usage["cache_read_input_tokens"])
	hit.cacheWrite = intVal(usage["cache_creation_input_tokens"])
	if hit.input+hit.output == 0 {
		return hit
	}
	hit.model, _ = msg["model"].(string)
	ts, _ := row["timestamp"].(string)
	if ts != "" {
		if t, err := time.Parse(time.RFC3339, ts); err == nil {
			hit.date = t.Format("2006-01-02")
		}
	}
	if hit.date == "" {
		hit.date = time.Now().Format("2006-01-02")
	}
	hit.ok = true
	return hit
}

func scanClaudeStatsCache(path string) ([]types.DailyUsage, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var cache struct {
		LastComputedDate string `json:"lastComputedDate"`
		ModelUsage       map[string]struct {
			InputTokens              int `json:"inputTokens"`
			OutputTokens             int `json:"outputTokens"`
			CacheReadInputTokens     int `json:"cacheReadInputTokens"`
			CacheCreationInputTokens int `json:"cacheCreationInputTokens"`
		} `json:"modelUsage"`
		DailyModelTokens []struct {
			Date          string         `json:"date"`
			TokensByModel map[string]int `json:"tokensByModel"`
		} `json:"dailyModelTokens"`
	}
	if err := json.Unmarshal(data, &cache); err != nil {
		return nil, err
	}

	// Prefer daily breakdown when present; otherwise emit one row per model on lastComputedDate.
	if len(cache.DailyModelTokens) > 0 && len(cache.ModelUsage) > 0 {
		// Distribute lifetime model ratios across daily totals when only total tokens are stored.
		var result []types.DailyUsage
		for _, day := range cache.DailyModelTokens {
			for model, total := range day.TokensByModel {
				mu, ok := cache.ModelUsage[model]
				if !ok || total <= 0 {
					result = append(result, types.DailyUsage{
						Date: day.Date, ToolName: "claude", Model: model,
						InputTokens: total, Source: "claude_stats_cache",
					})
					continue
				}
				denom := mu.InputTokens + mu.OutputTokens + mu.CacheReadInputTokens + mu.CacheCreationInputTokens
				if denom <= 0 {
					continue
				}
				frac := float64(total) / float64(denom)
				row := types.DailyUsage{
					Date:             day.Date,
					ToolName:         "claude",
					Model:            model,
					InputTokens:      int(float64(mu.InputTokens) * frac),
					OutputTokens:     int(float64(mu.OutputTokens) * frac),
					CacheReadTokens:  int(float64(mu.CacheReadInputTokens) * frac),
					CacheWriteTokens: int(float64(mu.CacheCreationInputTokens) * frac),
					Source:           "claude_stats_cache",
					Requests:         1,
				}
				row.EstimatedCost = EstimateCost(model, row.InputTokens, row.OutputTokens, row.CacheReadTokens, row.CacheWriteTokens)
				result = append(result, row)
			}
		}
		if len(result) > 0 {
			return result, nil
		}
	}

	date := cache.LastComputedDate
	if date == "" {
		date = time.Now().Format("2006-01-02")
	}
	var result []types.DailyUsage
	for model, mu := range cache.ModelUsage {
		if mu.InputTokens+mu.OutputTokens == 0 {
			continue
		}
		row := types.DailyUsage{
			Date:             date,
			ToolName:         "claude",
			Model:            model,
			InputTokens:      mu.InputTokens,
			OutputTokens:     mu.OutputTokens,
			CacheReadTokens:  mu.CacheReadInputTokens,
			CacheWriteTokens: mu.CacheCreationInputTokens,
			Source:           "claude_stats_cache",
			Requests:         1,
		}
		row.EstimatedCost = EstimateCost(model, row.InputTokens, row.OutputTokens, row.CacheReadTokens, row.CacheWriteTokens)
		result = append(result, row)
	}
	return result, nil
}

func intVal(v any) int {
	switch n := v.(type) {
	case float64:
		return int(n)
	case int:
		return n
	case int64:
		return int(n)
	case json.Number:
		i, _ := n.Int64()
		return int(i)
	}
	return 0
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
