package workextract

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/usejunction/agent/internal/client"
	"github.com/usejunction/agent/internal/scan"
)

type cursorTranscriptScan struct {
	counts          map[string]int
	tools           []string
	skills          []string
	steps           []client.WorkTraceStep
	files           []string
	planTitle       string
	events          []toolEvent
	started         time.Time
	ended           time.Time
	userTurns       int
	assistantTurns  int
	firstUserText   string // local-only fallback for intent
	capturedTurns   []client.WorkTraceUserTurn
	fileChanges     []client.WorkTraceFileChange
	changeNarrative *client.WorkTraceChangeNarrative
}

func mergeCursorAgentTranscripts(byID map[string]client.WorkSession, evidence map[string]*understandingEvidence) {
	home, _ := os.UserHomeDir()
	root := filepath.Join(home, ".cursor", "projects")
	if _, err := os.Stat(root); err != nil {
		return
	}

	type hit struct {
		path    string
		mtime   time.Time
		project string
	}
	index := map[string]hit{} // localID -> best transcript
	_ = filepath.Walk(root, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}
		if info.IsDir() {
			base := filepath.Base(path)
			if base == "subagents" {
				return filepath.SkipDir
			}
			return nil
		}
		if !strings.HasSuffix(path, ".jsonl") {
			return nil
		}
		if !strings.Contains(path, string(filepath.Separator)+"agent-transcripts"+string(filepath.Separator)) {
			return nil
		}
		id := filepath.Base(filepath.Dir(path))
		if id == "" || id == "subagents" {
			return nil
		}
		// Prefer the canonical <id>/<id>.jsonl transcript over nested copies.
		if filepath.Base(path) != id+".jsonl" && filepath.Base(path) != id {
			return nil
		}
		localID := "cursor:" + clip(id, 120)
		projectSlug := cursorProjectSlugFromTranscriptPath(path)
		mtime := info.ModTime().UTC()
		if prev, ok := index[localID]; ok && !mtime.After(prev.mtime) {
			return nil
		}
		index[localID] = hit{path: path, mtime: mtime, project: projectSlug}
		return nil
	})

	for localID, hit := range index {
		scan := scanCursorTranscript(hit.path)
		if len(scan.counts) == 0 && len(scan.skills) == 0 && scan.planTitle == "" {
			continue
		}

		ev := ensureEvidence(evidence, localID)
		ev.UserTurns = scan.userTurns
		ev.AssistantTurns = scan.assistantTurns
		ev.ToolCalls = 0
		for _, n := range scan.counts {
			ev.ToolCalls += n
		}
		if scan.planTitle != "" {
			ev.PlanTitle = scan.planTitle
		}
		if scan.firstUserText != "" && ev.DerivedUserTurn == "" {
			ev.DerivedUserTurn = scan.firstUserText
		}
		if len(scan.capturedTurns) > 0 {
			ev.CapturedTurns = append(ev.CapturedTurns, scan.capturedTurns...)
		}
		if len(scan.fileChanges) > 0 {
			ev.CapturedChanges = append(ev.CapturedChanges, scan.fileChanges...)
		}
		if scan.changeNarrative != nil {
			ev.ChangeNarrative = preferChangeNarrative(ev.ChangeNarrative, scan.changeNarrative)
		}

		location := locationFromCursorProjectSlug(hit.project)
		started := scan.started
		ended := scan.ended
		if started.IsZero() {
			started = fileBirthOrMod(hit.path, hit.mtime)
		}
		if ended.IsZero() {
			ended = hit.mtime
		}
		if ended.Before(started) {
			ended = started
		}
		dur := durationBetween(started, ended)

		applyTranscriptEnrichment := func(session client.WorkSession) client.WorkSession {
			session.ToolCallCounts = formatToolCounts(scan.counts)
			if session.Trace == nil {
				session.Trace = &client.WorkTrace{}
			}
			session.Trace.Tools = uniqStrings(append(session.Trace.Tools, scan.tools...))
			if len(session.Trace.Tools) > 80 {
				session.Trace.Tools = session.Trace.Tools[:80]
			}
			session.Trace.Skills = uniqStrings(append(session.Trace.Skills, scan.skills...))
			if len(session.Trace.Skills) > 40 {
				session.Trace.Skills = session.Trace.Skills[:40]
			}
			session.Trace.Files = uniqStrings(append(session.Trace.Files, scan.files...))
			if len(session.Trace.Files) > 40 {
				session.Trace.Files = session.Trace.Files[:40]
			}
			if len(session.Trace.Steps) == 0 {
				session.Trace.Steps = scan.steps
			}
			if len(session.Trace.Steps) > 40 {
				session.Trace.Steps = session.Trace.Steps[:40]
			}
			if session.Trace.Location == nil {
				session.Trace.Location = location
			}
			if session.Title == "" && scan.planTitle != "" {
				session.Title = scan.planTitle
			}
			if session.Repository == nil && location != nil {
				session.Repository = location.Repository
			}
			if session.Mode == "" {
				session.Mode = "agent"
			}
			if session.Trace.Approach == "" {
				session.Trace.Approach = "agent"
			}
			if dur > 0 {
				session.Trace.DurationSeconds = dur
			}
			enrichTraceDerived(session.Trace, scan.events, session.Trace.Files)
			applyChangeNarrative(session.Trace, scan.changeNarrative)
			if !started.IsZero() && (session.StartedAt == "" || started.UTC().Format(time.RFC3339) < session.StartedAt) {
				session.StartedAt = rfc3339OrEmpty(started)
			}
			obs := observedFallback(ended)
			if obs > session.ObservedAt {
				session.ObservedAt = obs
				session.EndedAt = rfc3339OrEmpty(ended)
			}
			session.Source = mergeSource(session.Source, "cursor_agent_transcript")
			return session
		}

		if existing, ok := byID[localID]; ok {
			byID[localID] = applyTranscriptEnrichment(existing)
			continue
		}

		projectLabel := ""
		if location != nil {
			projectLabel = location.Project
			if location.Repository != nil && location.Repository.Name != "" {
				projectLabel = location.Repository.Name
			}
		}
		title := scan.planTitle
		if title == "" && projectLabel != "" {
			title = "Cursor agent · " + projectLabel
		}
		if title == "" {
			title = "Cursor agent session"
		}
		tldr := ""
		if len(scan.tools) > 0 {
			shown := scan.tools
			if len(shown) > 6 {
				shown = shown[:6]
			}
			tldr = strings.Join(shown, ", ")
			if len(scan.tools) > 6 {
				tldr += ", +" + strconv.Itoa(len(scan.tools)-6)
			}
		}

		trace := &client.WorkTrace{
			Approach:        "agent",
			Location:        location,
			Tools:           scan.tools,
			Skills:          scan.skills,
			Files:           scan.files,
			Steps:           scan.steps,
			DurationSeconds: dur,
		}
		enrichTraceDerived(trace, scan.events, scan.files)
		applyChangeNarrative(trace, scan.changeNarrative)
		var repo *client.RepositoryReport
		if location != nil {
			repo = location.Repository
		}
		byID[localID] = client.WorkSession{
			LocalID:        localID,
			ToolName:       "cursor",
			Mode:           "agent",
			Title:          clip(title, 240),
			Tldr:           clip(tldr, 500),
			StartedAt:      rfc3339OrEmpty(started),
			EndedAt:        rfc3339OrEmpty(ended),
			ObservedAt:     observedFallback(ended),
			ToolCallCounts: formatToolCounts(scan.counts),
			Trace:          trace,
			Repository:     repo,
			Source:         clampSource("cursor_agent_transcript"),
		}
	}
}

func isFileTouchTool(name string) bool {
	switch strings.ToLower(name) {
	case "read", "write", "streplace", "strreplace", "delete", "editnotebook", "readfile", "deletefile", "searchreplace", "edit":
		return true
	default:
		return false
	}
}

func isEditWriteTool(name string) bool {
	switch strings.ToLower(strings.TrimSpace(name)) {
	case "write", "writefile", "streplace", "strreplace", "searchreplace", "apply_patch", "applypatch", "edit", "editnotebook", "delete", "deletefile":
		return true
	default:
		return false
	}
}

func scanCursorTranscript(path string) cursorTranscriptScan {
	out := cursorTranscriptScan{counts: map[string]int{}}
	f, err := os.Open(path)
	if err != nil {
		return out
	}
	defer f.Close()

	toolOrder := []string{}
	toolSeen := map[string]bool{}
	skillSeen := map[string]bool{}
	stepSeen := map[string]bool{}
	fileSeen := map[string]bool{}
	sawEditWrite := false

	_ = scan.ForEachJSONLLine(f, func(line []byte) error {
		var row map[string]any
		if json.Unmarshal(line, &row) != nil {
			return nil
		}
		if ts := parseTimestamp(row["timestamp"]); !ts.IsZero() {
			if out.started.IsZero() || ts.Before(out.started) {
				out.started = ts
			}
			if out.ended.IsZero() || ts.After(out.ended) {
				out.ended = ts
			}
		}
		msg, _ := row["message"].(map[string]any)
		if msg == nil {
			return nil
		}
		role, _ := row["role"].(string)
		if role == "" {
			role, _ = msg["role"].(string)
		}
		content, _ := msg["content"].([]any)
		hasTool := false
		var textParts []string
		for _, item := range content {
			block, ok := item.(map[string]any)
			if !ok {
				continue
			}
			typ, _ := block["type"].(string)
			if typ == "text" {
				if t, _ := block["text"].(string); strings.TrimSpace(t) != "" {
					textParts = append(textParts, strings.TrimSpace(t))
				}
				continue
			}
			if typ != "tool_use" {
				continue
			}
			hasTool = true
			name, _ := block["name"].(string)
			name = sanitizeToolName(name)
			if name == "" {
				continue
			}
			out.counts[name]++
			if !toolSeen[name] {
				toolSeen[name] = true
				toolOrder = append(toolOrder, name)
			}
			if isEditWriteTool(name) {
				sawEditWrite = true
			}
			ev := toolEvent{Name: name}
			if strings.EqualFold(name, "TodoWrite") || strings.EqualFold(name, "Task") {
				key := "step:" + name
				if !stepSeen[key] && len(out.steps) < 40 {
					stepSeen[key] = true
					out.steps = append(out.steps, client.WorkTraceStep{Kind: "tool", Name: name})
				}
			}
			inp, _ := block["input"].(map[string]any)
			if inp != nil {
				if strings.EqualFold(name, "CreatePlan") && out.planTitle == "" {
					if raw, _ := inp["name"].(string); strings.TrimSpace(raw) != "" {
						out.planTitle = clip(raw, 240)
					}
				}
				if strings.EqualFold(name, "Shell") || strings.EqualFold(name, "Bash") {
					for _, key := range []string{"command", "cmd"} {
						raw, _ := inp[key].(string)
						if tok := shellFirstToken(raw); tok != "" {
							ev.ShellToken = tok
							break
						}
					}
				}
				isSkillTool := strings.EqualFold(name, "Skill") || strings.EqualFold(name, "skill")
				for _, key := range []string{"skill", "skillName", "name", "path", "skillPath"} {
					raw, _ := inp[key].(string)
					allowBare := isSkillTool && (key == "skill" || key == "skillName" || key == "name")
					if skill := skillNameFromValue(raw, allowBare); skill != "" {
						if !skillSeen[skill] {
							skillSeen[skill] = true
							out.skills = append(out.skills, skill)
						}
						if isSkillTool {
							ev.IsSkill = true
							ev.SkillName = skill
						}
					}
				}
				if isFileTouchTool(name) {
					for _, key := range []string{"path", "filePath", "target_notebook", "targetFile"} {
						raw, _ := inp[key].(string)
						base := basenameOnly(raw)
						if base == "" {
							continue
						}
						ev.FileBase = base
						if !fileSeen[base] {
							fileSeen[base] = true
							out.files = append(out.files, base)
						}
						out.capturedTurns, out.fileChanges = recordToolFileChange(out.capturedTurns, out.fileChanges, name, base)
						break
					}
				}
			}
			out.events = append(out.events, ev)
		}
		switch strings.ToLower(role) {
		case "user":
			out.userTurns++
			if len(textParts) > 0 && !hasTool {
				joined := strings.Join(textParts, "\n")
				ts := parseTimestamp(row["timestamp"])
				if turn, ok := captureUserTurn(joined, ts); ok {
					out.capturedTurns = append(out.capturedTurns, turn)
				}
				if out.firstUserText == "" {
					if derived := deriveIntentFromUserTurn(joined); derived != "" {
						out.firstUserText = derived
					}
				}
			}
		case "assistant":
			out.assistantTurns++
			// Capture only the wrap-up after edits — never full assistant chat.
			if sawEditWrite && len(textParts) > 0 {
				joined := strings.Join(textParts, "\n")
				ts := parseTimestamp(row["timestamp"])
				if n, ok := captureChangeNarrative(joined, ts, changeNarrativeSourceAssistantFinal, true); ok {
					out.changeNarrative = preferChangeNarrative(out.changeNarrative, &n)
				}
			}
		}
		return nil
	})

	if len(toolOrder) > 80 {
		toolOrder = toolOrder[:80]
	}
	if len(out.skills) > 40 {
		out.skills = out.skills[:40]
	}
	if len(out.files) > 40 {
		out.files = out.files[:40]
	}
	if len(out.steps) > 40 {
		out.steps = out.steps[:40]
	}
	out.tools = toolOrder
	return out
}

func skillNameFromValue(raw string, allowBareName bool) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	lower := strings.ToLower(raw)
	if strings.Contains(lower, "/skills/") || strings.Contains(lower, ".cursor/skills") || strings.Contains(lower, "/.agents/skills/") {
		parts := strings.Split(filepath.ToSlash(raw), "/")
		for i, part := range parts {
			if part == "skills" && i+1 < len(parts) {
				return clip(parts[i+1], 128)
			}
		}
	}
	if strings.EqualFold(filepath.Base(raw), "skill.md") {
		return clip(filepath.Base(filepath.Dir(raw)), 128)
	}
	if allowBareName {
		// Skill tool often passes a short identifier like "canvas" or "create-rule".
		if len(raw) <= 128 && !strings.ContainsAny(raw, " \t\n/\\") {
			return clip(raw, 128)
		}
	}
	return ""
}
