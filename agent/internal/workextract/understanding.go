package workextract

import (
	"path/filepath"
	"regexp"
	"strings"
	"unicode"

	"github.com/usejunction/agent/internal/client"
)

// understandingEvidence carries on-device-only hints used to derive claims.
// Raw user text never leaves this struct onto the wire except via CapturedTurns
// after redact/clip in captureUserTurn, and ChangeNarrative after redact/clip.
type understandingEvidence struct {
	SummaryBullet   string // first Cursor summary bullet when present
	PlanTitle       string
	DerivedUserTurn string // already redacted/clipped locally; may still be rejected
	UserTurns       int
	AssistantTurns  int
	ToolCalls       int
	RequestCount    int
	AIEditEvents    int
	HumanEditEvents int
	TabEditEvents   int
	PrimaryFiles    []string // basename touch ranking
	Draft           bool
	Archived        bool
	AbortedTurns    int
	HasAuthorship   bool
	CapturedTurns   []client.WorkTraceUserTurn
	CapturedChanges []client.WorkTraceFileChange
	ChangeNarrative *client.WorkTraceChangeNarrative
}

var secretPatterns = []*regexp.Regexp{
	regexp.MustCompile(`(?i)\b(sk-[a-z0-9_-]{16,}|sk-ant-[a-z0-9_-]{16,}|ghp_[a-z0-9]{20,}|gho_[a-z0-9]{20,})\b`),
	regexp.MustCompile(`(?i)\b(bearer\s+[a-z0-9._\-+=/]{20,}|api[_-]?key\s*[:=]\s*\S+)\b`),
	regexp.MustCompile(`(?i)-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----`),
	regexp.MustCompile(`(?i)\b(xox[baprs]-[0-9a-z-]{10,})\b`),
	regexp.MustCompile(`[A-Za-z0-9+/_-]{48,}={0,2}`), // long opaque tokens
}

func looksSecret(s string) bool {
	s = strings.TrimSpace(s)
	if s == "" {
		return false
	}
	for _, re := range secretPatterns {
		if re.MatchString(s) {
			return true
		}
	}
	return false
}

func deriveIntentFromUserTurn(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" || looksSecret(raw) {
		return ""
	}
	// Cursor agent transcripts often wrap the real ask in <user_query>…</user_query>.
	if start := strings.Index(strings.ToLower(raw), "<user_query>"); start >= 0 {
		rest := raw[start+len("<user_query>"):]
		if end := strings.Index(strings.ToLower(rest), "</user_query>"); end >= 0 {
			raw = rest[:end]
		} else {
			raw = rest
		}
	}
	// Strip other XML-ish tags (timestamp, system reminders, etc.).
	raw = stripAngleTags(raw)
	raw = strings.ReplaceAll(raw, "\r", "\n")
	lines := strings.Split(raw, "\n")
	var parts []string
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		if strings.HasPrefix(line, "```") || strings.HasPrefix(line, "---") {
			continue
		}
		lower := strings.ToLower(line)
		if strings.HasPrefix(lower, "timestamp>") || strings.Contains(lower, "utc+") {
			continue
		}
		parts = append(parts, line)
		if len(strings.Join(parts, " ")) >= 160 {
			break
		}
		if len(parts) >= 2 {
			break
		}
	}
	out := strings.Join(parts, " ")
	out = strings.Join(strings.Fields(out), " ")
	out = stripURLs(out)
	if looksSecret(out) {
		return ""
	}
	out = clip(out, 160)
	letters := 0
	for _, r := range out {
		if unicode.IsLetter(r) {
			letters++
		}
	}
	if letters < 8 {
		return ""
	}
	return out
}

func stripAngleTags(s string) string {
	var b strings.Builder
	b.Grow(len(s))
	inTag := false
	for _, r := range s {
		switch {
		case r == '<':
			inTag = true
		case r == '>':
			inTag = false
			b.WriteByte(' ')
		case !inTag:
			b.WriteRune(r)
		}
	}
	return b.String()
}

var urlPattern = regexp.MustCompile(`(?i)https?://\S+`)

func stripURLs(s string) string {
	return strings.Join(strings.Fields(urlPattern.ReplaceAllString(s, " ")), " ")
}

func buildUnderstanding(session *client.WorkSession, ev understandingEvidence) {
	if session == nil {
		return
	}
	if session.Trace == nil {
		session.Trace = &client.WorkTrace{}
	}
	trace := session.Trace
	u := &client.WorkTraceUnderstanding{Version: 1}
	conf := &client.WorkTraceUnderstandingConfidence{}

	// --- Intent (priority: summary bullet → overview/tldr → title → plan → derived) ---
	if intent := clip(strings.TrimSpace(ev.SummaryBullet), 160); intent != "" && !looksSecret(intent) && !isToolListSummary(intent) {
		u.Intent = intent
		u.IntentSource = "summary"
		conf.Intent = 0.9
	} else if intent := clip(firstNonEmpty(session.Overview, session.Tldr), 160); intent != "" && !looksSecret(intent) && !isToolListSummary(intent) && !isSyntheticCursorTitle(intent) {
		u.Intent = intent
		u.IntentSource = "summary"
		conf.Intent = 0.85
	} else if intent := clip(strings.TrimSpace(session.Title), 160); intent != "" && !isSyntheticCursorTitle(intent) && !isToolListSummary(intent) && !looksSecret(intent) {
		u.Intent = intent
		u.IntentSource = "title"
		conf.Intent = 0.7
	} else if intent := clip(strings.TrimSpace(ev.PlanTitle), 160); intent != "" && !looksSecret(intent) {
		u.Intent = intent
		u.IntentSource = "plan"
		conf.Intent = 0.6
	} else if intent := deriveIntentFromUserTurn(ev.DerivedUserTurn); intent != "" {
		u.Intent = intent
		u.IntentSource = "user_turn_derived"
		conf.Intent = 0.4
	}

	// --- Context ---
	kinds := []string{}
	if trace.Location != nil || session.Repository != nil {
		kinds = append(kinds, "repo")
	}
	if len(trace.Files) > 0 || len(ev.PrimaryFiles) > 0 {
		kinds = append(kinds, "files")
	}
	if len(trace.Skills) > 0 {
		kinds = append(kinds, "skills")
	}
	if containsTool(trace.Tools, "WebSearch", "WebFetch", "web_search") {
		kinds = append(kinds, "web")
	}
	if trace.TestInvolved != nil && *trace.TestInvolved {
		kinds = append(kinds, "tests")
	}
	if containsTool(trace.Tools, "CreatePlan", "update_plan", "TodoWrite") || ev.PlanTitle != "" {
		kinds = append(kinds, "plan")
	}
	if len(kinds) > 0 || len(trace.Skills) > 0 || len(trace.Files) > 0 || len(ev.PrimaryFiles) > 0 {
		ctx := &client.WorkTraceUnderstandingContext{Kinds: uniqStrings(kinds)}
		if len(ctx.Kinds) > 8 {
			ctx.Kinds = ctx.Kinds[:8]
		}
		primary := ev.PrimaryFiles
		if len(primary) == 0 {
			primary = trace.Files
		}
		if len(primary) > 8 {
			primary = primary[:8]
		}
		ctx.PrimaryFiles = primary
		if len(trace.Skills) > 0 {
			skills := trace.Skills
			if len(skills) > 8 {
				skills = skills[:8]
			}
			ctx.Skills = skills
		}
		u.Context = ctx
	}

	// --- Actors ---
	u.Actors = &client.WorkTraceUnderstandingActors{
		Tool:  clip(session.ToolName, 64),
		Model: clip(session.Model, 128),
		Mode:  clip(session.Mode, 64),
	}

	// --- Sequence ---
	toolCalls := ev.ToolCalls
	if toolCalls == 0 && session.ToolCallCounts != nil {
		for _, n := range session.ToolCallCounts {
			toolCalls += n
		}
	}
	seq := &client.WorkTraceUnderstandingSequence{
		Fingerprint:    clip(trace.PhaseFingerprint, 120),
		UserTurns:      ev.UserTurns,
		AssistantTurns: ev.AssistantTurns,
		ToolCalls:      toolCalls,
	}
	if seq.Fingerprint != "" || seq.UserTurns > 0 || seq.AssistantTurns > 0 || seq.ToolCalls > 0 {
		u.Sequence = seq
	}

	// --- Attempts ---
	signals := []string{}
	score := 1
	if trace.Churn != nil && (trace.Churn.FilesRewritten > 0 || trace.Churn.RewriteEvents > 0) {
		signals = append(signals, "rewrite_loop")
		score += minInt(3, trace.Churn.FilesRewritten+trace.Churn.RewriteEvents/2)
	}
	if ev.UserTurns > 1 {
		signals = append(signals, "reprompt")
		score += minInt(3, ev.UserTurns-1)
	}
	if ev.AbortedTurns > 0 {
		signals = append(signals, "aborted_turn")
		score += ev.AbortedTurns
	}
	if ev.RequestCount > 1 {
		signals = append(signals, "multi_request")
		score += minInt(4, ev.RequestCount-1)
	}
	if score > 1000 {
		score = 1000
	}
	if len(signals) > 8 {
		signals = signals[:8]
	}
	u.Attempts = &client.WorkTraceUnderstandingAttempts{Score: score, Signals: signals}

	// --- Authorship (Cursor-strong) ---
	if ev.HasAuthorship {
		total := ev.AIEditEvents + ev.HumanEditEvents + ev.TabEditEvents
		auth := &client.WorkTraceUnderstandingAuthorship{
			AIEditEvents:    ev.AIEditEvents,
			HumanEditEvents: ev.HumanEditEvents,
			TabEditEvents:   ev.TabEditEvents,
			RequestCount:    ev.RequestCount,
		}
		if total > 0 {
			auth.AIShare = float64(ev.AIEditEvents) / float64(total)
		}
		u.Authorship = auth
		conf.Authorship = 0.85
	}

	// --- Acceptance / outcome (proxies — never claim user accepted) ---
	accSignals := []string{}
	outEvidence := []string{}
	accStatus := "unknown"
	outStatus := "unknown"

	if ev.Draft || ev.Archived {
		accSignals = append(accSignals, "draft")
		if ev.Archived {
			accSignals = append(accSignals, "archived")
		}
		accStatus = "abandoned"
		outStatus = "abandoned"
		outEvidence = append(outEvidence, "draft_or_archived")
	}
	if trace.Verify != nil && trace.Verify.AfterEdit {
		accSignals = append(accSignals, "verified_after_edit")
		if accStatus == "unknown" {
			accStatus = "likely_kept"
		}
		if outStatus != "abandoned" {
			outStatus = "verified"
			outEvidence = append(outEvidence, "verified_after_edit")
		}
	}
	if trace.Git != nil && trace.Git.Committed != nil && *trace.Git.Committed {
		accSignals = append(accSignals, "committed_in_window")
		if accStatus == "unknown" || accStatus == "likely_kept" {
			accStatus = "likely_kept"
		}
		outStatus = "committed"
		outEvidence = append(outEvidence, "committed_in_window")
	} else if trace.Git != nil && len(trace.Git.Commits) > 0 {
		accSignals = append(accSignals, "committed_in_window")
		if accStatus == "unknown" {
			accStatus = "likely_kept"
		}
		outStatus = "committed"
		outEvidence = append(outEvidence, "commits_in_window")
	}
	if ev.HasAuthorship && ev.AIEditEvents > 0 {
		accSignals = append(accSignals, "ai_hashes_present")
		if accStatus == "unknown" {
			accStatus = "likely_kept"
		}
		if outStatus == "unknown" {
			outStatus = "in_progress"
			outEvidence = append(outEvidence, "ai_edits_present")
		}
	}
	if outStatus == "unknown" && (toolCalls > 0 || len(trace.Tools) > 0) {
		outStatus = "in_progress"
		outEvidence = append(outEvidence, "tools_used")
	}
	if ev.HumanEditEvents > 0 && ev.AIEditEvents > 0 && accStatus == "likely_kept" {
		accStatus = "mixed"
	}
	if len(accSignals) > 8 {
		accSignals = accSignals[:8]
	}
	if len(outEvidence) > 8 {
		outEvidence = outEvidence[:8]
	}
	u.Acceptance = &client.WorkTraceUnderstandingAcceptance{Status: accStatus, Signals: uniqStrings(accSignals)}
	u.Outcome = &client.WorkTraceUnderstandingOutcome{Status: outStatus, Evidence: uniqStrings(outEvidence)}

	switch accStatus {
	case "abandoned":
		conf.Acceptance = 0.7
	case "likely_kept", "mixed":
		conf.Acceptance = 0.55
	default:
		conf.Acceptance = 0.3
	}
	switch outStatus {
	case "committed", "abandoned":
		conf.Outcome = 0.7
	case "verified":
		conf.Outcome = 0.6
	case "in_progress":
		conf.Outcome = 0.5
	default:
		conf.Outcome = 0.2
	}

	u.Confidence = conf
	trace.Understanding = u
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if strings.TrimSpace(v) != "" {
			return strings.TrimSpace(v)
		}
	}
	return ""
}

func isSyntheticCursorTitle(title string) bool {
	t := strings.ToLower(strings.TrimSpace(title))
	return strings.HasPrefix(t, "cursor agent") || t == "cursor agent session"
}

// isToolListSummary detects heuristic TLDRs like "Read, Grep, StrReplace, +3".
func isToolListSummary(s string) bool {
	s = strings.TrimSpace(s)
	if s == "" {
		return false
	}
	// Known tool-list pattern from transcript enrichment.
	if strings.Contains(s, ", +") || strings.HasSuffix(s, "+") {
		parts := strings.Split(s, ",")
		if len(parts) >= 3 {
			toolish := 0
			for _, p := range parts {
				p = strings.TrimSpace(p)
				if p == "" || strings.HasPrefix(p, "+") {
					continue
				}
				if sanitizeToolName(p) == p && p != "" {
					toolish++
				}
			}
			if toolish >= 3 {
				return true
			}
		}
	}
	parts := strings.Split(s, ",")
	if len(parts) >= 4 {
		toolish := 0
		for _, p := range parts {
			p = strings.TrimSpace(p)
			if sanitizeToolName(p) == p && p != "" && !strings.Contains(p, " ") {
				toolish++
			}
		}
		if toolish >= 4 {
			return true
		}
	}
	return false
}

func containsTool(tools []string, names ...string) bool {
	want := map[string]bool{}
	for _, n := range names {
		want[strings.ToLower(n)] = true
	}
	for _, t := range tools {
		if want[strings.ToLower(t)] {
			return true
		}
	}
	return false
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func basenameOnly(path string) string {
	base := filepath.Base(strings.TrimSpace(path))
	if base == "" || base == "." || base == "/" {
		return ""
	}
	return clip(base, 180)
}
