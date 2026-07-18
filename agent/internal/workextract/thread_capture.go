package workextract

import (
	"strings"
	"time"

	"github.com/usejunction/agent/internal/client"
)

const (
	maxUserTurns              = 40
	maxUserTurnChars          = 2000
	maxFileChangelog          = 80
	maxFilesPerTurn           = 20
	maxChangeNarrativeChars   = 2000
	maxChangeNarrativeBullets = 12
)

const (
	changeNarrativeSourceAssistantFinal      = "assistant_final"
	changeNarrativeSourceConversationSummary = "conversation_summary"
	changeNarrativeSourceComposerSubtitle    = "composer_subtitle"
)

// captureUserTurn prepares a user-only turn for upload. Returns empty if the
// text should be dropped (secrets / too short after cleanup).
func captureUserTurn(raw string, at time.Time) (client.WorkTraceUserTurn, bool) {
	text := prepareUserTurnText(raw)
	if text == "" {
		return client.WorkTraceUserTurn{}, false
	}
	turn := client.WorkTraceUserTurn{Text: text}
	if !at.IsZero() {
		turn.At = at.UTC().Format(time.RFC3339)
	}
	return turn, true
}

func prepareUserTurnText(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" || looksSecret(raw) {
		return ""
	}
	// Prefer <user_query> body when present (Cursor agent transcripts).
	if start := strings.Index(strings.ToLower(raw), "<user_query>"); start >= 0 {
		rest := raw[start+len("<user_query>"):]
		if end := strings.Index(strings.ToLower(rest), "</user_query>"); end >= 0 {
			raw = rest[:end]
		} else {
			raw = rest
		}
	}
	raw = stripAngleTags(raw)
	raw = stripURLs(raw)
	raw = strings.Join(strings.Fields(strings.ReplaceAll(raw, "\r", "\n")), " ")
	if looksSecret(raw) {
		return ""
	}
	raw = clip(raw, maxUserTurnChars)
	letters := 0
	for _, r := range raw {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') {
			letters++
		}
	}
	if letters < 4 {
		return ""
	}
	return raw
}

func capUserTurns(turns []client.WorkTraceUserTurn) []client.WorkTraceUserTurn {
	if len(turns) > maxUserTurns {
		return turns[:maxUserTurns]
	}
	return turns
}

func fileOpFromTool(name string) string {
	switch strings.ToLower(strings.TrimSpace(name)) {
	case "read", "readfile", "grep", "glob", "semanticsearch":
		return "read"
	case "write", "writefile":
		return "write"
	case "streplace", "strreplace", "searchreplace", "apply_patch", "applypatch", "edit", "editnotebook":
		return "edit"
	case "delete", "deletefile":
		return "delete"
	default:
		return "unknown"
	}
}

type changelogKey struct {
	file   string
	op     string
	source string
}

func mergeFileChangelog(rows []client.WorkTraceFileChange) []client.WorkTraceFileChange {
	order := make([]changelogKey, 0, len(rows))
	agg := map[changelogKey]*client.WorkTraceFileChange{}
	for _, row := range rows {
		file := basenameOnly(row.File)
		if file == "" {
			continue
		}
		op := row.Op
		if op == "" {
			op = "unknown"
		}
		source := row.Source
		if source == "" {
			source = "unknown"
		}
		key := changelogKey{file: file, op: op, source: source}
		if existing, ok := agg[key]; ok {
			add := row.Events
			if add <= 0 {
				add = 1
			}
			existing.Events += add
			continue
		}
		events := row.Events
		if events <= 0 {
			events = 1
		}
		copyRow := client.WorkTraceFileChange{File: file, Op: op, Source: source, Events: events}
		agg[key] = &copyRow
		order = append(order, key)
	}
	out := make([]client.WorkTraceFileChange, 0, len(order))
	for _, key := range order {
		out = append(out, *agg[key])
		if len(out) >= maxFileChangelog {
			break
		}
	}
	return out
}

func appendToolFileChange(dst []client.WorkTraceFileChange, toolName, fileBase string) []client.WorkTraceFileChange {
	base := basenameOnly(fileBase)
	if base == "" {
		return dst
	}
	op := fileOpFromTool(toolName)
	if op == "unknown" && !editTools[strings.ToLower(toolName)] && !exploreTools[strings.ToLower(toolName)] {
		// Only keep file-touch tools.
		switch strings.ToLower(toolName) {
		case "read", "write", "streplace", "strreplace", "delete", "edit", "editnotebook",
			"deletefile", "apply_patch", "applypatch", "searchreplace", "readfile":
		default:
			return dst
		}
	}
	return append(dst, client.WorkTraceFileChange{
		File:   base,
		Op:     op,
		Source: "tool",
		Events: 1,
	})
}

// recordToolFileChange appends a file touch to the session changelog and to the
// most recent captured user turn (files changed "after" that ask).
func recordToolFileChange(
	turns []client.WorkTraceUserTurn,
	dst []client.WorkTraceFileChange,
	toolName, fileBase string,
) ([]client.WorkTraceUserTurn, []client.WorkTraceFileChange) {
	next := appendToolFileChange(nil, toolName, fileBase)
	if len(next) == 0 {
		return turns, dst
	}
	change := next[0]
	dst = append(dst, change)
	if n := len(turns); n > 0 {
		turns[n-1].Files = append(turns[n-1].Files, change)
	}
	return turns, dst
}

func recordFileChange(
	turns []client.WorkTraceUserTurn,
	dst []client.WorkTraceFileChange,
	change client.WorkTraceFileChange,
) ([]client.WorkTraceUserTurn, []client.WorkTraceFileChange) {
	base := basenameOnly(change.File)
	if base == "" {
		return turns, dst
	}
	change.File = base
	if change.Op == "" {
		change.Op = "unknown"
	}
	if change.Source == "" {
		change.Source = "unknown"
	}
	if change.Events <= 0 {
		change.Events = 1
	}
	dst = append(dst, change)
	if n := len(turns); n > 0 {
		turns[n-1].Files = append(turns[n-1].Files, change)
	}
	return turns, dst
}

func applyThreadCapture(trace *client.WorkTrace, turns []client.WorkTraceUserTurn, changes []client.WorkTraceFileChange) {
	if trace == nil {
		return
	}
	turns = capUserTurns(turns)
	for i := range turns {
		if len(turns[i].Files) == 0 {
			continue
		}
		turns[i].Files = mergeFileChangelog(turns[i].Files)
		if len(turns[i].Files) > maxFilesPerTurn {
			turns[i].Files = turns[i].Files[:maxFilesPerTurn]
		}
	}
	if len(turns) > 0 {
		trace.UserTurns = turns
	}
	changes = mergeFileChangelog(changes)
	if len(changes) > 0 {
		trace.FileChangelog = changes
	}
}

func changeNarrativeSourceRank(source string) int {
	switch source {
	case changeNarrativeSourceConversationSummary:
		return 3
	case changeNarrativeSourceAssistantFinal:
		return 2
	case changeNarrativeSourceComposerSubtitle:
		return 1
	default:
		return 0
	}
}

// preferChangeNarrative keeps the higher-priority / longer narrative.
func preferChangeNarrative(existing, candidate *client.WorkTraceChangeNarrative) *client.WorkTraceChangeNarrative {
	if candidate == nil || strings.TrimSpace(candidate.Text) == "" {
		return existing
	}
	if existing == nil || strings.TrimSpace(existing.Text) == "" {
		return candidate
	}
	er := changeNarrativeSourceRank(existing.Source)
	cr := changeNarrativeSourceRank(candidate.Source)
	if cr > er {
		return candidate
	}
	if cr < er {
		return existing
	}
	if len(candidate.Text) > len(existing.Text) {
		return candidate
	}
	return existing
}

func applyChangeNarrative(trace *client.WorkTrace, narrative *client.WorkTraceChangeNarrative) {
	if trace == nil || narrative == nil || strings.TrimSpace(narrative.Text) == "" {
		return
	}
	trace.ChangeNarrative = preferChangeNarrative(trace.ChangeNarrative, narrative)
}

// captureChangeNarrative prepares a clipped, redacted change summary.
// When requireHeuristic is true (assistant_final), text must look like a wrap-up.
func captureChangeNarrative(raw string, at time.Time, source string, requireHeuristic bool) (client.WorkTraceChangeNarrative, bool) {
	text := prepareChangeNarrativeText(raw)
	if text == "" {
		return client.WorkTraceChangeNarrative{}, false
	}
	if requireHeuristic && !looksLikeChangeNarrative(text) {
		return client.WorkTraceChangeNarrative{}, false
	}
	source = strings.TrimSpace(source)
	if changeNarrativeSourceRank(source) == 0 {
		source = changeNarrativeSourceAssistantFinal
	}
	out := client.WorkTraceChangeNarrative{
		Text:   text,
		Source: source,
	}
	if !at.IsZero() {
		out.At = at.UTC().Format(time.RFC3339)
	}
	if bullets := parseNarrativeBullets(text); len(bullets) > 0 {
		out.Bullets = bullets
	}
	return out, true
}

func prepareChangeNarrativeText(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" || looksSecret(raw) {
		return ""
	}
	raw = stripAngleTags(raw)
	raw = stripURLsPreserveNewlines(raw)
	raw = strings.ReplaceAll(raw, "\r\n", "\n")
	raw = strings.ReplaceAll(raw, "\r", "\n")
	lines := strings.Split(raw, "\n")
	cleaned := make([]string, 0, len(lines))
	blank := false
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			if !blank && len(cleaned) > 0 {
				cleaned = append(cleaned, "")
				blank = true
			}
			continue
		}
		blank = false
		cleaned = append(cleaned, line)
	}
	raw = strings.Join(cleaned, "\n")
	if looksSecret(raw) {
		return ""
	}
	letters := 0
	for _, r := range raw {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') {
			letters++
		}
	}
	if letters < 12 {
		return ""
	}
	return clip(raw, maxChangeNarrativeChars)
}

func stripURLsPreserveNewlines(s string) string {
	s = urlPattern.ReplaceAllString(s, " ")
	lines := strings.Split(s, "\n")
	for i, line := range lines {
		lines[i] = strings.Join(strings.Fields(line), " ")
	}
	return strings.Join(lines, "\n")
}

func looksLikeChangeNarrative(text string) bool {
	text = strings.TrimSpace(text)
	if text == "" {
		return false
	}
	for _, line := range strings.Split(text, "\n") {
		t := strings.TrimSpace(line)
		if strings.HasPrefix(t, "- ") || strings.HasPrefix(t, "* ") {
			return true
		}
		if len(t) > 2 && t[0] >= '1' && t[0] <= '9' {
			dot := strings.IndexByte(t, '.')
			if dot > 0 && dot < 3 && dot+1 < len(t) && t[dot+1] == ' ' {
				return true
			}
		}
	}
	lower := strings.ToLower(text)
	for _, prefix := range []string{
		"updated ", "added ", "fixed ", "refactored ", "implemented ", "created ",
		"wired ", "expanded ", "shipped ", "removed ", "renamed ", "documented ",
		"no runtime ", "this change ", "the change ",
	} {
		if strings.HasPrefix(lower, prefix) {
			return true
		}
	}
	hasChangeWord := strings.Contains(lower, "updated") ||
		strings.Contains(lower, "changed") ||
		strings.Contains(lower, "added") ||
		strings.Contains(lower, "fixed") ||
		strings.Contains(lower, "implemented")
	hasFileHint := strings.Contains(text, ".ts") ||
		strings.Contains(text, ".tsx") ||
		strings.Contains(text, ".go") ||
		strings.Contains(text, ".md") ||
		strings.Contains(text, ".sql") ||
		strings.Contains(text, ".prisma") ||
		strings.Contains(text, "`")
	return hasChangeWord && hasFileHint
}

func parseNarrativeBullets(text string) []string {
	var out []string
	for _, line := range strings.Split(text, "\n") {
		t := strings.TrimSpace(line)
		bullet := ""
		switch {
		case strings.HasPrefix(t, "- "):
			bullet = strings.TrimSpace(t[2:])
		case strings.HasPrefix(t, "* "):
			bullet = strings.TrimSpace(t[2:])
		default:
			if len(t) > 2 && t[0] >= '1' && t[0] <= '9' {
				dot := strings.IndexByte(t, '.')
				if dot > 0 && dot < 3 && dot+1 < len(t) && t[dot+1] == ' ' {
					bullet = strings.TrimSpace(t[dot+2:])
				}
			}
		}
		if bullet == "" {
			continue
		}
		out = append(out, clip(bullet, 400))
		if len(out) >= maxChangeNarrativeBullets {
			break
		}
	}
	return out
}

// changeNarrativeFromSummaryParts builds a narrative from Cursor conversation_summaries fields.
func changeNarrativeFromSummaryParts(overview string, bullets []string, at time.Time) *client.WorkTraceChangeNarrative {
	overview = strings.TrimSpace(overview)
	cleanBullets := make([]string, 0, len(bullets))
	for _, b := range bullets {
		b = strings.TrimSpace(b)
		if b == "" {
			continue
		}
		cleanBullets = append(cleanBullets, clip(b, 400))
		if len(cleanBullets) >= maxChangeNarrativeBullets {
			break
		}
	}
	text := overview
	if text == "" && len(cleanBullets) > 0 {
		var parts []string
		for _, b := range cleanBullets {
			parts = append(parts, "- "+b)
		}
		text = strings.Join(parts, "\n")
	} else if text != "" && len(cleanBullets) > 0 && !strings.Contains(text, "\n") {
		// Keep overview as lead, append bullets when overview is a single paragraph.
		var parts []string
		parts = append(parts, text)
		for _, b := range cleanBullets {
			parts = append(parts, "- "+b)
		}
		text = strings.Join(parts, "\n")
	}
	n, ok := captureChangeNarrative(text, at, changeNarrativeSourceConversationSummary, false)
	if !ok {
		return nil
	}
	if len(cleanBullets) > 0 {
		n.Bullets = cleanBullets
	}
	return &n
}

func changeNarrativeFromComposerSubtitle(subtitle string, at time.Time) *client.WorkTraceChangeNarrative {
	subtitle = strings.TrimSpace(subtitle)
	if subtitle == "" {
		return nil
	}
	// Skip bare file-list subtitles like "Edited a.ts, b.go".
	lower := strings.ToLower(subtitle)
	if strings.HasPrefix(lower, "edited ") && !looksLikeChangeNarrative(subtitle) {
		return nil
	}
	n, ok := captureChangeNarrative(subtitle, at, changeNarrativeSourceComposerSubtitle, false)
	if !ok {
		return nil
	}
	return &n
}

// changeNarrativeFromSessionFallback uses overview / tldr when no transcript narrative exists.
func changeNarrativeFromSessionFallback(session client.WorkSession) *client.WorkTraceChangeNarrative {
	at := time.Time{}
	if session.EndedAt != "" {
		if t, err := time.Parse(time.RFC3339, session.EndedAt); err == nil {
			at = t
		}
	}
	if n := changeNarrativeFromSummaryParts(session.Overview, nil, at); n != nil {
		return n
	}
	tldr := strings.TrimSpace(session.Tldr)
	title := strings.TrimSpace(session.Title)
	if tldr != "" && tldr != title && !looksLikeToolListTldr(tldr) {
		if n, ok := captureChangeNarrative(tldr, at, changeNarrativeSourceConversationSummary, false); ok {
			return &n
		}
	}
	if session.Metadata != nil {
		if bullet, _ := session.Metadata["summaryBullet"].(string); strings.TrimSpace(bullet) != "" {
			if n, ok := captureChangeNarrative(bullet, at, changeNarrativeSourceConversationSummary, false); ok {
				return &n
			}
		}
	}
	return nil
}

func looksLikeToolListTldr(s string) bool {
	s = strings.TrimSpace(s)
	if s == "" {
		return false
	}
	// Synthetic transcript tldrs look like "Read, Grep, StrReplace, +3".
	if strings.Contains(s, ", +") {
		return true
	}
	parts := strings.Split(s, ",")
	if len(parts) < 2 {
		return false
	}
	toolish := 0
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}
		if strings.HasPrefix(p, "+") {
			toolish++
			continue
		}
		letters := 0
		for _, r := range p {
			if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') {
				letters++
			}
		}
		if letters > 0 && letters == len(strings.ReplaceAll(p, " ", "")) && !strings.Contains(p, " ") {
			toolish++
		}
	}
	return toolish >= 2 && toolish == len(parts)
}
