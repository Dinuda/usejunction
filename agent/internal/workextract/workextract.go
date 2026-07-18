// Package workextract reads structured “what’s being done” metadata from local
// AI coding tools when Signals work extraction is enabled.
//
// Supported today: Cursor (composer headers in state.vscdb + agent transcripts),
// Codex (~/.codex/sessions JSONL), Claude Code (~/.claude/projects JSONL).
// Copilot / Cline / OpenCode / Continue are usage-scanned elsewhere but do not
// yet emit work sessions.
//
// It never reads raw prompts, chat message bodies, tool argument values beyond
// skill identifiers, or file contents — only titles/summaries (when the tool
// already stores them), models, modes, location/repo metadata, tool-call kind
// names, skill names, and structured activity traces.
package workextract

import (
	"crypto/sha1"
	"encoding/hex"
	"net/url"
	"path/filepath"
	"strings"
	"time"

	"github.com/usejunction/agent/internal/client"
)

// MinAgentVersion is the first agent release that includes work extraction
// with changeNarrative (clipped allowlisted summaries).
// Keep in sync with WORK_EXTRACTION_MIN_AGENT_VERSION on the control plane.
const MinAgentVersion = "0.3.0"

const (
	maxSessionsIncremental = 200
	maxSessionsBackfill    = 1000
	cursorLimitIncremental = 150
	cursorLimitBackfill    = 1000
)

// Options controls collect depth.
type Options struct {
	// Backfill scans a larger historical window (first sync after enable/update).
	Backfill bool
	// Since, when set and Backfill is false, keeps sessions with ObservedAt
	// strictly greater than this watermark (already-captured boundary excluded).
	Since time.Time
}

// Collect gathers work sessions from supported local tools.
func Collect(opts Options) []client.WorkSession {
	cursorLimit := cursorLimitIncremental
	maxSessions := maxSessionsIncremental
	if opts.Backfill {
		cursorLimit = cursorLimitBackfill
		maxSessions = maxSessionsBackfill
	}

	var out []client.WorkSession
	out = append(out, extractCursor(cursorLimit)...)
	out = append(out, extractCodex()...)
	out = append(out, extractClaude()...)

	if !opts.Backfill && !opts.Since.IsZero() {
		out = FilterSince(out, opts.Since)
	}

	if len(out) > maxSessions {
		out = sortByObservedDesc(out)[:maxSessions]
	}
	return out
}

func sortByObservedDesc(sessions []client.WorkSession) []client.WorkSession {
	sorted := append([]client.WorkSession(nil), sessions...)
	for i := 0; i < len(sorted); i++ {
		for j := i + 1; j < len(sorted); j++ {
			if sorted[j].ObservedAt > sorted[i].ObservedAt {
				sorted[i], sorted[j] = sorted[j], sorted[i]
			}
		}
	}
	return sorted
}

func clip(s string, max int) string {
	s = strings.TrimSpace(s)
	s = stripMarkdownDecoration(s)
	if s == "" {
		return ""
	}
	if len(s) <= max {
		return s
	}
	return s[:max]
}

func stripMarkdownDecoration(s string) string {
	s = strings.TrimSpace(s)
	if strings.HasPrefix(s, "**") && strings.HasSuffix(s, "**") && len(s) > 4 {
		s = strings.TrimSpace(s[2 : len(s)-2])
	}
	return strings.ReplaceAll(s, "**", "")
}

func localID(parts ...string) string {
	h := sha1.Sum([]byte(strings.Join(parts, "|")))
	return hex.EncodeToString(h[:])[:32]
}

func parseRepoURL(raw string) *client.RepositoryReport {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}
	if strings.HasPrefix(raw, "git@") {
		raw = strings.TrimPrefix(raw, "git@")
		raw = strings.Replace(raw, ":", "/", 1)
		raw = "https://" + raw
	}
	u, err := url.Parse(raw)
	if err != nil || u.Host == "" {
		return nil
	}
	path := strings.Trim(strings.TrimSuffix(u.Path, ".git"), "/")
	parts := strings.Split(path, "/")
	if len(parts) < 2 {
		return nil
	}
	return &client.RepositoryReport{
		Host:  strings.ToLower(u.Host),
		Owner: parts[len(parts)-2],
		Name:  parts[len(parts)-1],
	}
}

func rfc3339OrEmpty(t time.Time) string {
	if t.IsZero() {
		return ""
	}
	return t.UTC().Format(time.RFC3339)
}

func observedFallback(t time.Time) string {
	if t.IsZero() {
		return time.Now().UTC().Format(time.RFC3339)
	}
	return t.UTC().Format(time.RFC3339)
}

func basenameID(path string) string {
	base := filepath.Base(path)
	base = strings.TrimSuffix(base, filepath.Ext(base))
	if base == "" {
		return localID(path)
	}
	return clip(base, 128)
}

func formatToolCounts(counts map[string]int) map[string]int {
	if len(counts) == 0 {
		return nil
	}
	out := make(map[string]int, len(counts))
	for k, v := range counts {
		k = clip(k, 64)
		if k == "" || v <= 0 {
			continue
		}
		if v > 1_000_000 {
			v = 1_000_000
		}
		out[k] = v
	}
	if len(out) == 0 {
		return nil
	}
	return out
}

func hasWorkSignal(s client.WorkSession) bool {
	return s.Title != "" || s.Tldr != "" || s.Overview != "" || s.Model != "" || len(s.ToolCallCounts) > 0
}

func mergeToolCounts(dst map[string]int, name string) {
	name = clip(name, 64)
	if name == "" {
		return
	}
	dst[name]++
}

// FilterSince keeps sessions strictly newer than the watermark.
// Sessions at exactly `since` are excluded (already captured).
func FilterSince(sessions []client.WorkSession, since time.Time) []client.WorkSession {
	if since.IsZero() {
		return sessions
	}
	watermark := since.UTC().Format(time.RFC3339)
	out := make([]client.WorkSession, 0, len(sessions))
	for _, session := range sessions {
		if session.ObservedAt == "" {
			continue
		}
		if session.ObservedAt > watermark {
			out = append(out, session)
		}
	}
	return out
}
