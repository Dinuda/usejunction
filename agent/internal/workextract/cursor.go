package workextract

import (
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/usejunction/agent/internal/client"
	"github.com/usejunction/agent/internal/platformdirs"
	"github.com/usejunction/agent/internal/scan"
)

func cursorAITrackingDBPath() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".cursor", "ai-tracking", "ai-code-tracking.db")
}

// cursorStateDBPathOverride is set by tests to point at a fixture state.vscdb.
var cursorStateDBPathOverride string

func cursorStateDBPath() string {
	if cursorStateDBPathOverride != "" {
		return cursorStateDBPathOverride
	}
	return filepath.Join(platformdirs.CursorUserDir(), "globalStorage", "state.vscdb")
}

// extractCursor prefers composer headers (titles/modes/location) from Cursor's
// state DB, enriched with models from ai-code-hashes. Agent transcripts are
// merged in as a primary live source — composer headers often go stale while
// ~/.cursor/projects/**/agent-transcripts keep updating.
func extractCursor(limit int) []client.WorkSession {
	if limit <= 0 {
		limit = cursorLimitIncremental
	}

	byID := map[string]client.WorkSession{}
	evidence := map[string]*understandingEvidence{}

	for _, session := range extractCursorComposerHeaders(limit * 2) {
		byID[session.LocalID] = session
		ev := ensureEvidence(evidence, session.LocalID)
		if session.Metadata != nil {
			if v, ok := session.Metadata["draft"].(bool); ok && v {
				ev.Draft = true
			}
			if v, ok := session.Metadata["archived"].(bool); ok && v {
				ev.Archived = true
			}
		}
	}
	for _, session := range extractCursorConversationSummaries(limit) {
		ev := ensureEvidence(evidence, session.LocalID)
		if bullet, _ := session.Metadata["summaryBullet"].(string); bullet != "" {
			ev.SummaryBullet = bullet
			delete(session.Metadata, "summaryBullet")
			if len(session.Metadata) == 0 {
				session.Metadata = nil
			}
		}
		if existing, ok := byID[session.LocalID]; ok {
			byID[session.LocalID] = mergeCursorSession(existing, session)
			continue
		}
		byID[session.LocalID] = session
	}

	enrichCursorModels(byID)
	enrichCursorAuthorship(byID, evidence)
	mergeCursorAgentTranscripts(byID, evidence)
	enrichCursorGit(byID)

	out := make([]client.WorkSession, 0, len(byID))
	for _, session := range byID {
		if !hasWorkSignal(session) {
			continue
		}
		if session.Title == "" && session.Tldr == "" && session.Model == "" {
			continue
		}
		ev := evidence[session.LocalID]
		if ev == nil {
			ev = &understandingEvidence{}
		}
		if session.Metadata != nil {
			if v, ok := session.Metadata["draft"].(bool); ok && v {
				ev.Draft = true
			}
			if v, ok := session.Metadata["archived"].(bool); ok && v {
				ev.Archived = true
			}
		}
		s := session
		buildUnderstanding(&s, *ev)
		if s.Trace == nil {
			s.Trace = &client.WorkTrace{}
		}
		applyThreadCapture(s.Trace, ev.CapturedTurns, ev.CapturedChanges)
		applyChangeNarrative(s.Trace, ev.ChangeNarrative)
		if s.Trace.ChangeNarrative == nil {
			applyChangeNarrative(s.Trace, changeNarrativeFromSessionFallback(s))
		}
		out = append(out, s)
	}
	sort.Slice(out, func(i, j int) bool {
		return out[i].ObservedAt > out[j].ObservedAt
	})
	if len(out) > limit {
		out = out[:limit]
	}
	return out
}

func ensureEvidence(m map[string]*understandingEvidence, localID string) *understandingEvidence {
	if ev, ok := m[localID]; ok {
		return ev
	}
	ev := &understandingEvidence{}
	m[localID] = ev
	return ev
}

func mergeCursorSession(base, extra client.WorkSession) client.WorkSession {
	if base.Title == "" {
		base.Title = extra.Title
	}
	if base.Tldr == "" {
		base.Tldr = extra.Tldr
	}
	if base.Overview == "" {
		base.Overview = extra.Overview
	}
	if base.Model == "" {
		base.Model = extra.Model
	}
	if base.Mode == "" {
		base.Mode = extra.Mode
	}
	if extra.ObservedAt > base.ObservedAt {
		base.ObservedAt = extra.ObservedAt
		base.EndedAt = extra.EndedAt
	}
	if base.Source == "" {
		base.Source = clampSource(extra.Source)
	} else if extra.Source != "" {
		base.Source = mergeSource(base.Source, extra.Source)
	}
	base.Trace = mergeTrace(base.Trace, extra.Trace)
	if base.Repository == nil {
		base.Repository = extra.Repository
	}
	if len(base.ToolCallCounts) == 0 {
		base.ToolCallCounts = extra.ToolCallCounts
	}
	return base
}

func mergeTrace(base, extra *client.WorkTrace) *client.WorkTrace {
	if base == nil {
		return extra
	}
	if extra == nil {
		return base
	}
	if base.Approach == "" {
		base.Approach = extra.Approach
	}
	if base.Location == nil {
		base.Location = extra.Location
	}
	base.Skills = uniqStrings(append(base.Skills, extra.Skills...))
	base.Tools = uniqStrings(append(base.Tools, extra.Tools...))
	base.Files = uniqStrings(append(base.Files, extra.Files...))
	if len(base.Tools) > 80 {
		base.Tools = base.Tools[:80]
	}
	if len(base.Skills) > 40 {
		base.Skills = base.Skills[:40]
	}
	if len(base.Files) > 40 {
		base.Files = base.Files[:40]
	}
	if len(base.Steps) == 0 {
		base.Steps = extra.Steps
	}
	if base.Stats == nil {
		base.Stats = extra.Stats
	}
	if base.DurationSeconds == 0 {
		base.DurationSeconds = extra.DurationSeconds
	}
	if len(base.Phases) == 0 {
		base.Phases = extra.Phases
	}
	if base.PhaseFingerprint == "" {
		base.PhaseFingerprint = extra.PhaseFingerprint
	}
	if base.Churn == nil {
		base.Churn = extra.Churn
	}
	if base.Verify == nil {
		base.Verify = extra.Verify
	}
	if len(base.Languages) == 0 {
		base.Languages = extra.Languages
	}
	if base.TestInvolved == nil {
		base.TestInvolved = extra.TestInvolved
	}
	if len(base.SkillCounts) == 0 {
		base.SkillCounts = extra.SkillCounts
	}
	if base.Git == nil {
		base.Git = extra.Git
	}
	if base.ChangeNarrative == nil {
		base.ChangeNarrative = extra.ChangeNarrative
	} else if extra.ChangeNarrative != nil {
		base.ChangeNarrative = preferChangeNarrative(base.ChangeNarrative, extra.ChangeNarrative)
	}
	return base
}

func uniqStrings(values []string) []string {
	seen := map[string]bool{}
	out := make([]string, 0, len(values))
	for _, v := range values {
		v = strings.TrimSpace(v)
		if v == "" || seen[v] {
			continue
		}
		seen[v] = true
		out = append(out, v)
	}
	return out
}

func repositoryFromLocalPath(cwd string) *client.RepositoryReport {
	if cwd == "" || scan.IsPrivacyProtectedPath(cwd) {
		return nil
	}
	cmd := exec.Command("git", "-C", cwd, "config", "--get", "remote.origin.url")
	out, err := cmd.Output()
	if err != nil {
		return nil
	}
	return parseRepoURL(strings.TrimSpace(string(out)))
}

func cursorTimestamp(raw int64) time.Time {
	if raw <= 0 {
		return time.Time{}
	}
	if raw < 1_000_000_000_000 {
		return time.Unix(raw, 0)
	}
	return time.UnixMilli(raw)
}
