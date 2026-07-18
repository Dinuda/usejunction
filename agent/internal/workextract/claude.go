package workextract

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/usejunction/agent/internal/client"
	"github.com/usejunction/agent/internal/scan"
)

func extractClaude() []client.WorkSession {
	home, _ := os.UserHomeDir()
	roots := []string{
		filepath.Join(home, ".claude", "projects"),
		filepath.Join(home, ".config", "claude", "projects"),
	}
	if d := os.Getenv("CLAUDE_CONFIG_DIR"); d != "" {
		roots = append([]string{filepath.Join(d, "projects")}, roots...)
	}

	seen := map[string]bool{}
	var out []client.WorkSession
	for _, root := range roots {
		_ = filepath.Walk(root, func(path string, info os.FileInfo, err error) error {
			if err != nil || info.IsDir() || !strings.HasSuffix(path, ".jsonl") {
				return nil
			}
			if session, ok := extractClaudeFile(path); ok {
				if seen[session.LocalID] {
					return nil
				}
				seen[session.LocalID] = true
				out = append(out, session)
			}
			return nil
		})
	}
	return out
}

type claudeWorkState struct {
	sessionID       string
	model           string
	summary         string
	cwd             string
	gitBranch       string
	toolCounts      map[string]int
	toolOrder       []string
	toolSeen        map[string]bool
	events          []toolEvent
	files           []string
	fileSeen        map[string]bool
	startedAt       time.Time
	endedAt         time.Time
	userTurns       int
	assistantTurns  int
	firstUser       string
	capturedTurns   []client.WorkTraceUserTurn
	fileChanges     []client.WorkTraceFileChange
	sawEditWrite    bool
	changeNarrative *client.WorkTraceChangeNarrative
}

func extractClaudeFile(path string) (client.WorkSession, bool) {
	f, err := os.Open(path)
	if err != nil {
		return client.WorkSession{}, false
	}
	defer f.Close()

	state := &claudeWorkState{
		sessionID:  basenameID(path),
		toolCounts: map[string]int{},
		toolSeen:   map[string]bool{},
		fileSeen:   map[string]bool{},
	}

	_ = scan.ForEachJSONLLine(f, func(line []byte) error {
		var row map[string]any
		if json.Unmarshal(line, &row) != nil {
			return nil
		}
		applyClaudeRow(state, row)
		return nil
	})

	if state.model == "" && len(state.toolCounts) == 0 && state.summary == "" {
		return client.WorkSession{}, false
	}

	tools := state.toolOrder
	if len(tools) > 80 {
		tools = tools[:80]
	}
	files := state.files
	if len(files) > 40 {
		files = files[:40]
	}

	var trace *client.WorkTrace
	if len(tools) > 0 || !state.startedAt.IsZero() || len(files) > 0 {
		trace = &client.WorkTrace{
			Tools:           tools,
			Files:           files,
			DurationSeconds: durationBetween(state.startedAt, state.endedAt),
		}
		if state.cwd != "" && !scan.IsPrivacyProtectedPath(state.cwd) {
			project := filepath.Base(state.cwd)
			trace.Location = &client.WorkTraceLocation{
				Kind:    "local",
				Project: clip(project, 128),
			}
			if repo := repositoryFromLocalPath(state.cwd); repo != nil {
				trace.Location.Kind = "repo"
				trace.Location.Repository = repo
				if repo.Name != "" {
					trace.Location.Project = clip(repo.Name, 128)
				}
			}
		} else if state.cwd != "" {
			// Label only — never Stat under protected paths.
			trace.Location = &client.WorkTraceLocation{
				Kind:    "local",
				Project: clip(filepath.Base(state.cwd), 128),
			}
		}
		enrichTraceDerived(trace, state.events, files)
		if state.gitBranch != "" && !scan.IsPrivacyProtectedPath(state.cwd) {
			if trace.Git == nil {
				trace.Git = &client.WorkTraceGit{}
			}
			trace.Git.Branch = clip(state.gitBranch, 200)
		}
	}

	session := client.WorkSession{
		LocalID:        "claude:" + clip(state.sessionID, 120),
		ToolName:       "claude",
		Model:          clip(state.model, 128),
		Title:          clip(state.summary, 240),
		Tldr:           clip(state.summary, 500),
		StartedAt:      rfc3339OrEmpty(state.startedAt),
		EndedAt:        rfc3339OrEmpty(state.endedAt),
		ObservedAt:     observedFallback(state.endedAt),
		ToolCallCounts: formatToolCounts(state.toolCounts),
		Trace:          trace,
		Source:         clampSource("claude_session"),
	}
	if trace != nil && trace.Location != nil {
		session.Repository = trace.Location.Repository
	}
	if !hasWorkSignal(session) {
		return client.WorkSession{}, false
	}

	toolCalls := 0
	for _, n := range state.toolCounts {
		toolCalls += n
	}
	buildUnderstanding(&session, understandingEvidence{
		DerivedUserTurn: state.firstUser,
		UserTurns:       state.userTurns,
		AssistantTurns:  state.assistantTurns,
		ToolCalls:       toolCalls,
		PrimaryFiles:    files,
	})
	if session.Trace == nil {
		session.Trace = &client.WorkTrace{}
	}
	applyThreadCapture(session.Trace, state.capturedTurns, state.fileChanges)
	if state.changeNarrative != nil {
		applyChangeNarrative(session.Trace, state.changeNarrative)
	} else if state.summary != "" {
		if n, ok := captureChangeNarrative(state.summary, state.endedAt, changeNarrativeSourceConversationSummary, false); ok {
			applyChangeNarrative(session.Trace, &n)
		}
	}
	if session.Trace.ChangeNarrative == nil {
		applyChangeNarrative(session.Trace, changeNarrativeFromSessionFallback(session))
	}
	return session, true
}

func applyClaudeRow(state *claudeWorkState, row map[string]any) {
	ts := parseTimestamp(row["timestamp"])
	if !ts.IsZero() {
		if state.startedAt.IsZero() || ts.Before(state.startedAt) {
			state.startedAt = ts
		}
		if state.endedAt.IsZero() || ts.After(state.endedAt) {
			state.endedAt = ts
		}
	}

	if sid, _ := row["sessionId"].(string); sid != "" {
		state.sessionID = sid
	}
	if cwd, _ := row["cwd"].(string); cwd != "" {
		state.cwd = cwd
	}
	if branch, _ := row["gitBranch"].(string); branch != "" {
		state.gitBranch = branch
	}

	typ, _ := row["type"].(string)
	switch typ {
	case "summary":
		if summary, _ := row["summary"].(string); summary != "" {
			state.summary = summary
			ts := parseTimestamp(row["timestamp"])
			if n, ok := captureChangeNarrative(summary, ts, changeNarrativeSourceConversationSummary, false); ok {
				state.changeNarrative = preferChangeNarrative(state.changeNarrative, &n)
			}
		}
	case "user":
		state.userTurns++
		// Capture user text only — never full assistant chat bodies.
		var parts []string
		if msg, _ := row["message"].(map[string]any); msg != nil {
			if content, _ := msg["content"].([]any); content != nil {
				for _, item := range content {
					block, ok := item.(map[string]any)
					if !ok {
						continue
					}
					if t, _ := block["type"].(string); t == "text" {
						if text, _ := block["text"].(string); strings.TrimSpace(text) != "" {
							parts = append(parts, strings.TrimSpace(text))
						}
					}
				}
			} else if text, _ := msg["content"].(string); text != "" {
				parts = append(parts, text)
			}
		}
		if joined := strings.Join(parts, "\n"); joined != "" {
			ts := parseTimestamp(row["timestamp"])
			if turn, ok := captureUserTurn(joined, ts); ok {
				state.capturedTurns = append(state.capturedTurns, turn)
			}
			if state.firstUser == "" {
				if derived := deriveIntentFromUserTurn(joined); derived != "" {
					state.firstUser = derived
				}
			}
		}
	case "assistant":
		state.assistantTurns++
		msg, _ := row["message"].(map[string]any)
		if msg == nil {
			return
		}
		if model, _ := msg["model"].(string); model != "" {
			state.model = model
		}
		content, _ := msg["content"].([]any)
		var textParts []string
		for _, item := range content {
			block, ok := item.(map[string]any)
			if !ok {
				continue
			}
			blockType, _ := block["type"].(string)
			if blockType == "text" {
				if text, _ := block["text"].(string); strings.TrimSpace(text) != "" {
					textParts = append(textParts, strings.TrimSpace(text))
				}
				continue
			}
			if blockType != "tool_use" {
				continue
			}
			if name, _ := block["name"].(string); name != "" {
				if clean := sanitizeToolName(name); clean != "" {
					mergeToolCounts(state.toolCounts, clean)
					if !state.toolSeen[clean] {
						state.toolSeen[clean] = true
						state.toolOrder = append(state.toolOrder, clean)
					}
					if isEditWriteTool(clean) {
						state.sawEditWrite = true
					}
					ev := toolEvent{Name: clean}
					peekClaudeToolArgs(state, &ev, clean, block)
					state.events = append(state.events, ev)
				}
			}
		}
		if state.sawEditWrite && len(textParts) > 0 {
			joined := strings.Join(textParts, "\n")
			ts := parseTimestamp(row["timestamp"])
			if n, ok := captureChangeNarrative(joined, ts, changeNarrativeSourceAssistantFinal, true); ok {
				state.changeNarrative = preferChangeNarrative(state.changeNarrative, &n)
			}
		}
	}
}

func peekClaudeToolArgs(state *claudeWorkState, ev *toolEvent, name string, block map[string]any) {
	inp, _ := block["input"].(map[string]any)
	if inp == nil {
		return
	}
	lower := strings.ToLower(name)
	if lower == "bash" || lower == "shell" {
		for _, key := range []string{"command", "cmd"} {
			raw, _ := inp[key].(string)
			if tok := shellFirstToken(raw); tok != "" {
				ev.ShellToken = tok
				break
			}
		}
	}
	for _, key := range []string{"path", "file_path", "filePath", "target", "notebook_path"} {
		raw, _ := inp[key].(string)
		base := basenameOnly(raw)
		if base == "" {
			continue
		}
		ev.FileBase = base
		if !state.fileSeen[base] {
			state.fileSeen[base] = true
			state.files = append(state.files, base)
		}
		state.capturedTurns, state.fileChanges = recordToolFileChange(state.capturedTurns, state.fileChanges, name, base)
		break
	}
}
