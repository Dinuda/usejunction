package probe

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/usejunction/agent/internal/platformdirs"
	"github.com/usejunction/agent/internal/types"
)

const (
	antigravityUsageSource     = "antigravity_usage"
	antigravityLSGeneratorPath = "/exa.language_server_pb.LanguageServerService/GetCascadeTrajectoryGeneratorMetadata"
)

var (
	antigravityLSArgsCSRFRe = regexp.MustCompile(`--csrf_token\s+([0-9a-fA-F-]{36})`)
	antigravityLSHTTPPortRe  = regexp.MustCompile(`listening on random port at (\d+) for HTTP(?:\s|$)`)
	antigravityLSStartedRe   = regexp.MustCompile(`LS started on port (\d+)`)
)

// antigravityLSEndpointOverride is set by tests.
var antigravityLSEndpointOverride *antigravityLSEndpoint

type antigravityLSEndpoint struct {
	BaseURL string
	CSRF    string
}

// SetAntigravityLSEndpointForTest overrides LS discovery for unit tests.
func SetAntigravityLSEndpointForTest(baseURL, csrf string) (restore func()) {
	prev := antigravityLSEndpointOverride
	if baseURL == "" {
		antigravityLSEndpointOverride = nil
	} else {
		antigravityLSEndpointOverride = &antigravityLSEndpoint{BaseURL: strings.TrimRight(baseURL, "/"), CSRF: csrf}
	}
	return func() { antigravityLSEndpointOverride = prev }
}

// ScanAntigravityUsageFromLS asks the live Antigravity language server for
// generator metadata (tokens + model + responseId) for each local cascade id.
// Soft-fails when the IDE is closed or the LS is unreachable.
func ScanAntigravityUsageFromLS(ctx context.Context) ([]types.DailyUsage, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	ep, err := discoverAntigravityLSEndpoint()
	if err != nil || ep == nil {
		return nil, err
	}

	cascades := antigravityCascadeIDs()
	if len(cascades) == 0 {
		return nil, nil
	}

	client := &http.Client{Timeout: 8 * time.Second}
	buckets := map[string]*types.DailyUsage{}
	seen := map[string]bool{}
	for _, cascadeID := range cascades {
		select {
		case <-ctx.Done():
			return finalizeAntigravityLSBuckets(buckets), ctx.Err()
		default:
		}
		events, err := fetchAntigravityGeneratorMetadata(ctx, client, ep, cascadeID)
		if err != nil {
			continue
		}
		for _, ev := range events {
			if ev.ResponseID != "" {
				if seen[ev.ResponseID] {
					continue
				}
				seen[ev.ResponseID] = true
			}
			key := ev.Date + "|" + ev.Model
			b := buckets[key]
			if b == nil {
				b = &types.DailyUsage{
					Date:               ev.Date,
					ToolName:           "antigravity",
					Model:              ev.Model,
					Source:             antigravityUsageSource,
					MetricKind:         types.MetricKindUsage,
					TokenSemantics:     types.TokenSemanticsVendor,
					CalculationVersion: "usage-v2",
					Verified:           false,
				}
				buckets[key] = b
			}
			b.InputTokens += ev.Input
			b.OutputTokens += ev.Output
			b.CacheReadTokens += ev.CacheRead
			b.ReasoningTokens += ev.Reasoning
			b.Requests++
		}
	}
	return finalizeAntigravityLSBuckets(buckets), nil
}

type antigravityLSUsageEvent struct {
	Date       string
	Model      string
	Input      int
	Output     int
	CacheRead  int
	Reasoning  int
	ResponseID string
}

func finalizeAntigravityLSBuckets(buckets map[string]*types.DailyUsage) []types.DailyUsage {
	out := make([]types.DailyUsage, 0, len(buckets))
	for _, b := range buckets {
		out = append(out, *b)
	}
	return out
}

func discoverAntigravityLSEndpoint() (*antigravityLSEndpoint, error) {
	if antigravityLSEndpointOverride != nil {
		return antigravityLSEndpointOverride, nil
	}
	logs := antigravityLSMainLogs()
	for _, logPath := range logs {
		ep, err := parseAntigravityLSMainLog(logPath)
		if err != nil || ep == nil {
			continue
		}
		return ep, nil
	}
	return nil, os.ErrNotExist
}

func antigravityLSMainLogs() []string {
	var roots []string
	home, _ := os.UserHomeDir()
	switch runtime.GOOS {
	case "darwin":
		support := filepath.Join(home, "Library", "Application Support")
		roots = append(roots,
			filepath.Join(support, "Antigravity IDE", "logs"),
			filepath.Join(support, "Antigravity", "logs"),
		)
	case "linux":
		config := filepath.Join(home, ".config")
		roots = append(roots,
			filepath.Join(config, "Antigravity IDE", "logs"),
			filepath.Join(config, "Antigravity", "logs"),
		)
	case "windows":
		appData := os.Getenv("APPDATA")
		if appData != "" {
			roots = append(roots,
				filepath.Join(appData, "Antigravity IDE", "logs"),
				filepath.Join(appData, "Antigravity", "logs"),
			)
		}
	}
	type ranked struct {
		path string
		mod  time.Time
	}
	var found []ranked
	for _, root := range roots {
		_ = filepath.WalkDir(root, func(path string, d os.DirEntry, err error) error {
			if err != nil || d == nil || d.IsDir() {
				return nil
			}
			if !strings.EqualFold(d.Name(), "ls-main.log") {
				return nil
			}
			info, err := d.Info()
			if err != nil {
				return nil
			}
			found = append(found, ranked{path: path, mod: info.ModTime()})
			return nil
		})
	}
	sort.Slice(found, func(i, j int) bool { return found[i].mod.After(found[j].mod) })
	out := make([]string, 0, len(found))
	for _, f := range found {
		out = append(out, f.path)
	}
	return out
}

func parseAntigravityLSMainLog(path string) (*antigravityLSEndpoint, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	text := string(data)
	csrf := ""
	if m := antigravityLSArgsCSRFRe.FindStringSubmatch(text); len(m) == 2 {
		csrf = m[1]
	}
	httpPort := 0
	if m := antigravityLSHTTPPortRe.FindStringSubmatch(text); len(m) == 2 {
		httpPort, _ = strconv.Atoi(m[1])
	}
	if httpPort == 0 {
		// Fallback: "LS started on port N" is the HTTPS port; HTTP is typically N+1.
		if m := antigravityLSStartedRe.FindStringSubmatch(text); len(m) == 2 {
			if httpsPort, err := strconv.Atoi(m[1]); err == nil && httpsPort > 0 {
				httpPort = httpsPort + 1
			}
		}
	}
	if csrf == "" || httpPort == 0 {
		return nil, fmt.Errorf("antigravity ls endpoint not found in %s", path)
	}
	return &antigravityLSEndpoint{
		BaseURL: fmt.Sprintf("http://127.0.0.1:%d", httpPort),
		CSRF:    csrf,
	}, nil
}

func antigravityCascadeIDs() []string {
	seen := map[string]bool{}
	var out []string
	add := func(id string) {
		id = strings.TrimSpace(id)
		if id == "" || seen[id] {
			return
		}
		seen[id] = true
		out = append(out, id)
	}
	for _, root := range platformdirs.GeminiAntigravityRoots() {
		brain := filepath.Join(root, "brain")
		entries, err := os.ReadDir(brain)
		if err == nil {
			for _, ent := range entries {
				if ent.IsDir() {
					add(ent.Name())
				}
			}
		}
		conv := filepath.Join(root, "conversations")
		entries, err = os.ReadDir(conv)
		if err != nil {
			continue
		}
		for _, ent := range entries {
			if ent.IsDir() {
				continue
			}
			name := ent.Name()
			switch {
			case strings.HasSuffix(name, ".pb"):
				add(strings.TrimSuffix(name, ".pb"))
			case strings.HasSuffix(name, ".db"):
				add(strings.TrimSuffix(name, ".db"))
			}
		}
	}
	sort.Strings(out)
	return out
}

func fetchAntigravityGeneratorMetadata(ctx context.Context, client *http.Client, ep *antigravityLSEndpoint, cascadeID string) ([]antigravityLSUsageEvent, error) {
	body, _ := json.Marshal(map[string]string{"cascadeId": cascadeID})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, ep.BaseURL+antigravityLSGeneratorPath, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Connect-Protocol-Version", "1")
	req.Header.Set("x-codeium-csrf-token", ep.CSRF)

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 32<<20))
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("ls status %d: %s", resp.StatusCode, truncateForErr(raw, 200))
	}
	return parseAntigravityGeneratorMetadataJSON(raw)
}

func truncateForErr(b []byte, n int) string {
	if len(b) <= n {
		return string(b)
	}
	return string(b[:n])
}

func parseAntigravityGeneratorMetadataJSON(raw []byte) ([]antigravityLSUsageEvent, error) {
	var root struct {
		GeneratorMetadata []json.RawMessage `json:"generatorMetadata"`
	}
	if err := json.Unmarshal(raw, &root); err != nil {
		return nil, err
	}
	out := make([]antigravityLSUsageEvent, 0, len(root.GeneratorMetadata))
	for _, item := range root.GeneratorMetadata {
		ev, ok := parseAntigravityGeneratorMetadataItem(item)
		if ok {
			out = append(out, ev)
		}
	}
	return out, nil
}

func parseAntigravityGeneratorMetadataItem(raw json.RawMessage) (antigravityLSUsageEvent, bool) {
	var item struct {
		ChatModel *struct {
			Model          string `json:"model"`
			ResponseModel  string `json:"responseModel"`
			Usage          *struct {
				Model                 string `json:"model"`
				InputTokens           any    `json:"inputTokens"`
				OutputTokens          any    `json:"outputTokens"`
				CacheReadTokens       any    `json:"cacheReadTokens"`
				ThinkingOutputTokens  any    `json:"thinkingOutputTokens"`
				ResponseOutputTokens  any    `json:"responseOutputTokens"`
				ResponseID            string `json:"responseId"`
			} `json:"usage"`
			ChatStartMetadata *struct {
				CreatedAt string `json:"createdAt"`
			} `json:"chatStartMetadata"`
		} `json:"chatModel"`
	}
	if json.Unmarshal(raw, &item) != nil || item.ChatModel == nil || item.ChatModel.Usage == nil {
		return antigravityLSUsageEvent{}, false
	}
	u := item.ChatModel.Usage
	input := anyToInt(u.InputTokens)
	output := anyToInt(u.OutputTokens)
	cacheRead := anyToInt(u.CacheReadTokens)
	reasoning := anyToInt(u.ThinkingOutputTokens)
	if input+output+cacheRead+reasoning == 0 {
		return antigravityLSUsageEvent{}, false
	}

	model := ""
	for _, cand := range []string{item.ChatModel.ResponseModel, u.Model, item.ChatModel.Model} {
		if m := normalizeAntigravityLSModel(cand); m != "" {
			model = m
			break
		}
	}
	if model == "" {
		model = "unknown"
	}

	date := time.Now().UTC().Format("2006-01-02")
	if item.ChatModel.ChatStartMetadata != nil {
		if created := strings.TrimSpace(item.ChatModel.ChatStartMetadata.CreatedAt); created != "" {
			if t, err := time.Parse(time.RFC3339Nano, created); err == nil {
				date = t.UTC().Format("2006-01-02")
			} else if t, err := time.Parse(time.RFC3339, created); err == nil {
				date = t.UTC().Format("2006-01-02")
			}
		}
	}

	return antigravityLSUsageEvent{
		Date:       date,
		Model:      model,
		Input:      input,
		Output:     output,
		CacheRead:  cacheRead,
		Reasoning:  reasoning,
		ResponseID: strings.TrimSpace(u.ResponseID),
	}, true
}

func anyToInt(v any) int {
	switch n := v.(type) {
	case nil:
		return 0
	case float64:
		return int(n)
	case int:
		return n
	case int64:
		return int(n)
	case json.Number:
		i, _ := n.Int64()
		return int(i)
	case string:
		i, _ := strconv.Atoi(strings.TrimSpace(n))
		return i
	default:
		return 0
	}
}

func normalizeAntigravityLSModel(raw string) string {
	s := strings.TrimSpace(raw)
	if s == "" {
		return ""
	}
	lower := strings.ToLower(s)
	if strings.HasPrefix(lower, "model_placeholder_") {
		// Prefer responseModel when available; placeholders alone are not useful.
		return ""
	}
	switch {
	case strings.Contains(lower, "gemini") && strings.Contains(lower, "3.6") && strings.Contains(lower, "flash"):
		return "gemini-3.6-flash"
	case strings.Contains(lower, "gemini") && strings.Contains(lower, "3.5") && strings.Contains(lower, "flash"):
		return "gemini-3.5-flash"
	case strings.Contains(lower, "gemini") && strings.Contains(lower, "3.1") && strings.Contains(lower, "pro"):
		return "gemini-3.1-pro"
	case strings.Contains(lower, "claude") && strings.Contains(lower, "sonnet"):
		return "claude-sonnet-4.6"
	case strings.Contains(lower, "claude") && strings.Contains(lower, "opus"):
		return "claude-opus-4.6"
	case strings.Contains(lower, "gemini") && strings.Contains(lower, "flash"):
		return "gemini-3-flash"
	default:
		s = strings.ToLower(strings.ReplaceAll(s, " ", "-"))
		s = strings.ReplaceAll(s, "_", "-")
		return s
	}
}
