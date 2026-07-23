package workextract

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/usejunction/agent/internal/client"
	"github.com/usejunction/agent/internal/platformdirs"
	"github.com/usejunction/agent/internal/probe"
	"github.com/usejunction/agent/internal/scan"
)

const antigravityWorkSource = "antigravity_trajectory_summaries"

// extractAntigravity builds Signals work sessions from Antigravity's local
// trajectorySummaries index in state.vscdb. It never reads prompt bodies.
func extractAntigravity() []client.WorkSession {
	byID := map[string]client.WorkSession{}

	if summaries, err := probe.AntigravityTrajectorySummaries(); err == nil {
		for _, sum := range summaries {
			session := antigravitySummaryToSession(sum)
			if !hasWorkSignal(session) {
				continue
			}
			byID[session.LocalID] = session
		}
	}

	for _, brain := range extractAntigravityBrainMetadata() {
		if existing, ok := byID[brain.LocalID]; ok {
			byID[brain.LocalID] = mergeAntigravitySession(existing, brain)
			continue
		}
		if hasWorkSignal(brain) {
			byID[brain.LocalID] = brain
		}
	}

	out := make([]client.WorkSession, 0, len(byID))
	for _, session := range byID {
		out = append(out, session)
	}
	return sortAntigravitySessions(out)
}

func antigravitySummaryToSession(sum probe.AntigravityTrajectorySummary) client.WorkSession {
	observed := strings.TrimSpace(sum.ObservedAt)
	if observed == "" {
		observed = observedFallback(time.Now().UTC())
	}
	session := client.WorkSession{
		LocalID:    sum.LocalID,
		ToolName:   "antigravity",
		Title:      sum.Title,
		ObservedAt: observed,
		Source:     antigravityWorkSource,
		Trace:      &client.WorkTrace{},
	}
	if sum.Workspace != "" {
		session.Trace.Location = &client.WorkTraceLocation{
			Kind:    "workspace",
			Project: sum.Workspace,
		}
	}
	if sum.RepoHost != "" && sum.RepoOwner != "" && sum.RepoName != "" {
		repo := &client.RepositoryReport{
			Host:  sum.RepoHost,
			Owner: sum.RepoOwner,
			Name:  sum.RepoName,
		}
		session.Repository = repo
		if session.Trace.Location == nil {
			session.Trace.Location = &client.WorkTraceLocation{Kind: "repository"}
		}
		session.Trace.Location.Repository = repo
		if session.Trace.Location.Project == "" {
			session.Trace.Location.Project = sum.RepoName
		}
	}
	return session
}

func mergeAntigravitySession(base, extra client.WorkSession) client.WorkSession {
	if base.Title == "" {
		base.Title = extra.Title
	}
	if base.Tldr == "" {
		base.Tldr = extra.Tldr
	}
	if base.Model == "" {
		base.Model = extra.Model
	}
	if base.Repository == nil {
		base.Repository = extra.Repository
	}
	if base.Trace == nil {
		base.Trace = extra.Trace
	} else if extra.Trace != nil && base.Trace.Location == nil {
		base.Trace.Location = extra.Trace.Location
	}
	if extra.ObservedAt > base.ObservedAt {
		base.ObservedAt = extra.ObservedAt
	}
	return base
}

func sortAntigravitySessions(out []client.WorkSession) []client.WorkSession {
	sort.Slice(out, func(i, j int) bool {
		return out[i].ObservedAt > out[j].ObservedAt
	})
	if len(out) > maxSessionsIncremental {
		out = out[:maxSessionsIncremental]
	}
	return out
}

// extractAntigravityBrainMetadata reads privacy-safe titles from brain/*.metadata.json
// when present under ~/.gemini/antigravity*/brain/.
func extractAntigravityBrainMetadata() []client.WorkSession {
	var out []client.WorkSession
	for _, root := range platformdirs.GeminiAntigravityRoots() {
		brain := filepath.Join(root, "brain")
		entries, err := os.ReadDir(brain)
		if err != nil {
			continue
		}
		for _, ent := range entries {
			if !ent.IsDir() {
				continue
			}
			id := ent.Name()
			dir := filepath.Join(brain, id)
			session, ok := extractAntigravityBrainSession(id, dir)
			if !ok {
				continue
			}
			out = append(out, session)
		}
	}
	return out
}

func extractAntigravityBrainSession(id, dir string) (client.WorkSession, bool) {
	title := readAntigravityBrainTitle(dir)
	transcript := filepath.Join(dir, ".system_generated", "logs", "transcript.jsonl")
	model, toolCounts, started, ended := scanAntigravityBrainTranscriptMeta(transcript)
	if title == "" && model == "" && len(toolCounts) == 0 {
		return client.WorkSession{}, false
	}
	observed := ended
	if observed.IsZero() {
		observed = started
	}
	if observed.IsZero() {
		if info, err := os.Stat(dir); err == nil {
			observed = info.ModTime().UTC()
		} else {
			observed = time.Now().UTC()
		}
	}
	session := client.WorkSession{
		LocalID:        id,
		ToolName:       "antigravity",
		Title:          clip(title, 160),
		Model:          model,
		ToolCallCounts: toolCounts,
		ObservedAt:     observedFallback(observed),
		Source:         "antigravity_brain",
	}
	if !started.IsZero() {
		session.StartedAt = started.UTC().Format(time.RFC3339)
	}
	if !ended.IsZero() {
		session.EndedAt = ended.UTC().Format(time.RFC3339)
	}
	return session, true
}

func scanAntigravityBrainTranscriptMeta(path string) (model string, toolCounts map[string]int, started, ended time.Time) {
	f, err := os.Open(path)
	if err != nil {
		return "", nil, time.Time{}, time.Time{}
	}
	defer f.Close()

	toolCounts = map[string]int{}
	_ = scan.ForEachJSONLLine(f, func(line []byte) error {
		var row map[string]any
		if json.Unmarshal(line, &row) != nil {
			return nil
		}
		if created, _ := row["created_at"].(string); created != "" {
			if t, err := time.Parse(time.RFC3339, created); err == nil {
				if started.IsZero() || t.Before(started) {
					started = t
				}
				if ended.IsZero() || t.After(ended) {
					ended = t
				}
			}
		}
		if content, _ := row["content"].(string); content != "" {
			if parsed := extractAntigravityWorkSelectedModel(content); parsed != "" {
				model = parsed
			}
		}
		if tools, ok := row["tool_calls"].([]any); ok {
			for _, raw := range tools {
				tool, _ := raw.(map[string]any)
				name, _ := tool["name"].(string)
				name = strings.TrimSpace(name)
				if name == "" {
					continue
				}
				toolCounts[name]++
			}
		}
		return nil
	})
	if len(toolCounts) == 0 {
		toolCounts = nil
	}
	return model, toolCounts, started, ended
}

func extractAntigravityWorkSelectedModel(content string) string {
	lower := strings.ToLower(content)
	idx := strings.Index(lower, "model selection")
	if idx < 0 {
		return ""
	}
	rest := content[idx:]
	toIdx := strings.Index(strings.ToLower(rest), " to ")
	if toIdx < 0 {
		return ""
	}
	name := rest[toIdx+4:]
	cut := len(name)
	for i := 0; i < len(name); i++ {
		if name[i] != '.' {
			continue
		}
		if i+1 >= len(name) {
			cut = i
			break
		}
		next := name[i+1]
		if next == ' ' || next == '\n' || next == '\r' || next == '<' || next == '"' || next == '\'' {
			cut = i
			break
		}
	}
	return normalizeAntigravityWorkModel(name[:cut])
}

func normalizeAntigravityWorkModel(raw string) string {
	s := strings.TrimSpace(raw)
	s = strings.Trim(s, "`\"' ")
	for _, suffix := range []string{" (High)", " (Medium)", " (Low)", " (Thinking)"} {
		s = strings.ReplaceAll(s, suffix, "")
	}
	s = strings.TrimSpace(s)
	lower := strings.ToLower(s)
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
	case s == "":
		return ""
	default:
		return strings.ToLower(strings.ReplaceAll(s, " ", "-"))
	}
}

func readAntigravityBrainTitle(dir string) string {
	for _, name := range []string{"task.md", "implementation_plan.md", "walkthrough.md"} {
		data, err := os.ReadFile(filepath.Join(dir, name))
		if err != nil {
			continue
		}
		for _, line := range strings.Split(string(data), "\n") {
			line = strings.TrimSpace(line)
			if strings.HasPrefix(line, "# ") {
				return strings.TrimSpace(strings.TrimPrefix(line, "# "))
			}
		}
	}
	metaPath := filepath.Join(dir, "metadata.json")
	data, err := os.ReadFile(metaPath)
	if err != nil {
		matches, _ := filepath.Glob(filepath.Join(dir, "*.metadata.json"))
		if len(matches) == 0 {
			return ""
		}
		data, err = os.ReadFile(matches[0])
		if err != nil {
			return ""
		}
	}
	lower := strings.ToLower(string(data))
	for _, key := range []string{`"title"`, `"name"`, `"summary"`} {
		idx := strings.Index(lower, key)
		if idx < 0 {
			continue
		}
		rest := string(data[idx+len(key):])
		rest = strings.TrimSpace(rest)
		rest = strings.TrimPrefix(rest, ":")
		rest = strings.TrimSpace(rest)
		if len(rest) == 0 || rest[0] != '"' {
			continue
		}
		rest = rest[1:]
		end := strings.IndexByte(rest, '"')
		if end > 0 {
			return rest[:end]
		}
	}
	return ""
}
