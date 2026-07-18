package workextract

import (
	"database/sql"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"time"

	_ "modernc.org/sqlite"

	"github.com/usejunction/agent/internal/client"
	"github.com/usejunction/agent/internal/scan"
)

func cursorAITrackingDBPath() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".cursor", "ai-tracking", "ai-code-tracking.db")
}

func cursorStateDBPath() string {
	home, _ := os.UserHomeDir()
	if runtime.GOOS == "darwin" {
		return filepath.Join(home, "Library", "Application Support", "Cursor", "User", "globalStorage", "state.vscdb")
	}
	configHome := os.Getenv("XDG_CONFIG_HOME")
	if configHome == "" {
		configHome = filepath.Join(home, ".config")
	}
	return filepath.Join(configHome, "Cursor", "User", "globalStorage", "state.vscdb")
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

type composerHeadersPayload struct {
	AllComposers []composerHeader `json:"allComposers"`
}

type composerHeader struct {
	Type          string          `json:"type"`
	ComposerID    string          `json:"composerId"`
	Name          string          `json:"name"`
	Subtitle      string          `json:"subtitle"`
	UnifiedMode   string          `json:"unifiedMode"`
	ForceMode     string          `json:"forceMode"`
	CreatedAt     int64           `json:"createdAt"`
	LastUpdatedAt int64           `json:"lastUpdatedAt"`
	IsDraft       bool            `json:"isDraft"`
	IsArchived    bool            `json:"isArchived"`
	LinesAdded    int             `json:"totalLinesAdded"`
	LinesRemoved  int             `json:"totalLinesRemoved"`
	FilesChanged  int             `json:"filesChangedCount"`
	AgentLocation json.RawMessage `json:"agentLocation"`
}

func extractCursorComposerHeaders(limit int) []client.WorkSession {
	dbPath := cursorStateDBPath()
	if _, err := os.Stat(dbPath); err != nil {
		return nil
	}
	db, err := sql.Open("sqlite", "file:"+dbPath+"?mode=ro")
	if err != nil {
		return nil
	}
	defer db.Close()

	var raw string
	err = db.QueryRow(`SELECT value FROM ItemTable WHERE key = 'composer.composerHeaders'`).Scan(&raw)
	if err != nil || strings.TrimSpace(raw) == "" {
		return nil
	}

	var payload composerHeadersPayload
	if json.Unmarshal([]byte(raw), &payload) != nil {
		return nil
	}
	return composerHeadersToSessions(payload.AllComposers, limit)
}

func composerHeadersToSessions(headers []composerHeader, limit int) []client.WorkSession {
	type ranked struct {
		session client.WorkSession
		updated int64
	}
	var rankedRows []ranked
	for _, header := range headers {
		id := strings.TrimSpace(header.ComposerID)
		if id == "" || id == "empty-state-draft" {
			continue
		}
		title := clip(header.Name, 240)
		tldr := clip(header.Subtitle, 500)
		if title == "" && tldr == "" {
			continue
		}
		updated := header.LastUpdatedAt
		if updated <= 0 {
			updated = header.CreatedAt
		}
		observed := cursorTimestamp(updated)
		started := cursorTimestamp(header.CreatedAt)

		approach := strings.TrimSpace(header.UnifiedMode)
		if fm := strings.TrimSpace(header.ForceMode); fm != "" {
			if approach != "" {
				approach = approach + "/" + fm
			} else {
				approach = fm
			}
		}

		trace := &client.WorkTrace{
			Approach: clip(approach, 240),
			Files:    filesFromSubtitle(header.Subtitle),
			Location: locationFromAgentLocation(header.AgentLocation),
		}
		if n := changeNarrativeFromComposerSubtitle(header.Subtitle, observed); n != nil {
			trace.ChangeNarrative = n
		}
		if header.LinesAdded > 0 || header.LinesRemoved > 0 || header.FilesChanged > 0 {
			trace.Stats = &client.WorkTraceStats{
				LinesAdded:   header.LinesAdded,
				LinesRemoved: header.LinesRemoved,
				FilesChanged: header.FilesChanged,
			}
		}
		if !started.IsZero() && !observed.IsZero() {
			trace.DurationSeconds = durationBetween(started, observed)
		}
		if trace.Approach == "" && len(trace.Files) == 0 && trace.Location == nil && trace.Stats == nil && trace.DurationSeconds == 0 && trace.ChangeNarrative == nil {
			trace = nil
		}

		var repo *client.RepositoryReport
		if trace != nil && trace.Location != nil {
			repo = trace.Location.Repository
		}

		session := client.WorkSession{
			LocalID:    "cursor:" + clip(id, 120),
			ToolName:   "cursor",
			Mode:       clip(header.UnifiedMode, 64),
			Title:      title,
			Tldr:       tldr,
			StartedAt:  rfc3339OrEmpty(started),
			EndedAt:    rfc3339OrEmpty(observed),
			ObservedAt: observedFallback(observed),
			Trace:      trace,
			Repository: repo,
			Source:     clampSource("cursor_composer_headers"),
			Metadata:   map[string]any{},
		}
		if header.IsArchived {
			session.Metadata["archived"] = true
		}
		if header.IsDraft {
			session.Metadata["draft"] = true
		}
		rankedRows = append(rankedRows, ranked{session: session, updated: updated})
	}

	sort.Slice(rankedRows, func(i, j int) bool {
		return rankedRows[i].updated > rankedRows[j].updated
	})
	if len(rankedRows) > limit {
		rankedRows = rankedRows[:limit]
	}
	out := make([]client.WorkSession, 0, len(rankedRows))
	for _, row := range rankedRows {
		out = append(out, row.session)
	}
	return out
}

func filesFromSubtitle(subtitle string) []string {
	subtitle = strings.TrimSpace(subtitle)
	if subtitle == "" {
		return nil
	}
	// Cursor subtitles look like: "Read a.ts, b.ts, c.ts" or "Edited foo.go, bar.go"
	lower := strings.ToLower(subtitle)
	for _, prefix := range []string{"read ", "edited ", "wrote ", "created "} {
		if strings.HasPrefix(lower, prefix) {
			subtitle = strings.TrimSpace(subtitle[len(prefix):])
			break
		}
	}
	parts := strings.Split(subtitle, ",")
	out := make([]string, 0, len(parts))
	seen := map[string]bool{}
	for _, part := range parts {
		name := filepath.Base(strings.TrimSpace(part))
		name = clip(name, 180)
		if name == "" || seen[name] {
			continue
		}
		seen[name] = true
		out = append(out, name)
		if len(out) >= 40 {
			break
		}
	}
	return out
}

func locationFromAgentLocation(raw json.RawMessage) *client.WorkTraceLocation {
	if len(raw) == 0 {
		return nil
	}
	var loc struct {
		Type        string `json:"type"`
		Environment struct {
			URI struct {
				FSPath string `json:"fsPath"`
				Path   string `json:"path"`
			} `json:"uri"`
		} `json:"environment"`
	}
	if json.Unmarshal(raw, &loc) != nil {
		return nil
	}
	path := strings.TrimSpace(loc.Environment.URI.FSPath)
	if path == "" {
		path = strings.TrimSpace(loc.Environment.URI.Path)
	}
	project := clip(filepath.Base(path), 128)
	out := &client.WorkTraceLocation{
		Kind:    clip(loc.Type, 32),
		Project: project,
	}
	if path != "" && !scan.IsPrivacyProtectedPath(path) {
		if repo := repositoryFromLocalPath(path); repo != nil {
			out.Repository = repo
		}
	}
	if out.Kind == "" && out.Project == "" && out.Repository == nil {
		return nil
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

func extractCursorConversationSummaries(limit int) []client.WorkSession {
	dbPath := cursorAITrackingDBPath()
	if _, err := os.Stat(dbPath); err != nil {
		return nil
	}
	db, err := sql.Open("sqlite", "file:"+dbPath+"?mode=ro")
	if err != nil {
		return nil
	}
	defer db.Close()

	rows, err := db.Query(`
		SELECT conversationId,
		       COALESCE(title, ''),
		       COALESCE(tldr, ''),
		       COALESCE(overview, ''),
		       COALESCE(summaryBullets, ''),
		       COALESCE(model, ''),
		       COALESCE(mode, ''),
		       COALESCE(updatedAt, 0)
		FROM conversation_summaries
		WHERE conversationId IS NOT NULL AND conversationId != ''
		ORDER BY updatedAt DESC
		LIMIT ?
	`, limit)
	if err != nil {
		// Older DBs may lack summaryBullets — retry without it.
		rows, err = db.Query(`
			SELECT conversationId,
			       COALESCE(title, ''),
			       COALESCE(tldr, ''),
			       COALESCE(overview, ''),
			       '' AS summaryBullets,
			       COALESCE(model, ''),
			       COALESCE(mode, ''),
			       COALESCE(updatedAt, 0)
			FROM conversation_summaries
			WHERE conversationId IS NOT NULL AND conversationId != ''
			ORDER BY updatedAt DESC
			LIMIT ?
		`, limit)
		if err != nil {
			return nil
		}
	}
	defer rows.Close()

	var out []client.WorkSession
	for rows.Next() {
		var conversationID, title, tldr, overview, bulletsRaw, model, mode string
		var updatedAt int64
		if rows.Scan(&conversationID, &title, &tldr, &overview, &bulletsRaw, &model, &mode, &updatedAt) != nil {
			continue
		}
		firstBullet, overviewFromBullets := parseSummaryBullets(bulletsRaw)
		bulletItems := parseSummaryBulletItems(bulletsRaw)
		if overview == "" && overviewFromBullets != "" {
			overview = overviewFromBullets
		}
		observed := cursorTimestamp(updatedAt)
		session := client.WorkSession{
			LocalID:    "cursor:" + clip(conversationID, 120),
			ToolName:   "cursor",
			Model:      clip(model, 128),
			Mode:       clip(mode, 64),
			Title:      clip(title, 240),
			Tldr:       clip(tldr, 500),
			Overview:   clip(overview, 2000),
			ObservedAt: observedFallback(observed),
			EndedAt:    rfc3339OrEmpty(observed),
			Source:     clampSource("cursor_conversation_summaries"),
		}
		if firstBullet != "" {
			session.Metadata = map[string]any{"summaryBullet": firstBullet}
		}
		if n := changeNarrativeFromSummaryParts(overview, bulletItems, observed); n != nil {
			session.Trace = &client.WorkTrace{ChangeNarrative: n}
		}
		if !hasWorkSignal(session) {
			continue
		}
		out = append(out, session)
	}
	return out
}

func parseSummaryBullets(raw string) (first string, overview string) {
	items := parseSummaryBulletItems(raw)
	if len(items) == 0 {
		return "", ""
	}
	first = clip(items[0], 160)
	overview = clip(strings.Join(items, "; "), 2000)
	return first, overview
}

func parseSummaryBulletItems(raw string) []string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}
	var items []string
	if strings.HasPrefix(raw, "[") {
		var arr []any
		if json.Unmarshal([]byte(raw), &arr) == nil {
			for _, item := range arr {
				switch v := item.(type) {
				case string:
					if s := strings.TrimSpace(v); s != "" {
						items = append(items, s)
					}
				case map[string]any:
					if s, _ := v["text"].(string); strings.TrimSpace(s) != "" {
						items = append(items, strings.TrimSpace(s))
					}
				}
			}
		}
	} else {
		for _, line := range strings.Split(raw, "\n") {
			line = strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(line), "-"))
			line = strings.TrimSpace(strings.TrimPrefix(line, "*"))
			if line != "" {
				items = append(items, line)
			}
		}
	}
	if len(items) > maxChangeNarrativeBullets {
		items = items[:maxChangeNarrativeBullets]
	}
	return items
}

func enrichCursorAuthorship(byID map[string]client.WorkSession, evidence map[string]*understandingEvidence) {
	dbPath := cursorAITrackingDBPath()
	if _, err := os.Stat(dbPath); err != nil {
		return
	}
	db, err := sql.Open("sqlite", "file:"+dbPath+"?mode=ro")
	if err != nil {
		return
	}
	defer db.Close()

	rows, err := db.Query(`
		SELECT conversationId,
		       COALESCE(source, ''),
		       COUNT(*) AS n,
		       COUNT(DISTINCT requestId) AS requests
		FROM ai_code_hashes
		WHERE conversationId IS NOT NULL AND conversationId != ''
		GROUP BY conversationId, source
	`)
	if err != nil {
		return
	}
	defer rows.Close()

	type agg struct {
		ai, human, tab, requests int
	}
	byConv := map[string]*agg{}
	for rows.Next() {
		var conversationID, source string
		var n, requests int
		if rows.Scan(&conversationID, &source, &n, &requests) != nil {
			continue
		}
		localID := "cursor:" + clip(conversationID, 120)
		if _, ok := byID[localID]; !ok {
			continue
		}
		a := byConv[localID]
		if a == nil {
			a = &agg{}
			byConv[localID] = a
		}
		switch strings.ToLower(strings.TrimSpace(source)) {
		case "composer":
			a.ai += n
		case "human":
			a.human += n
		case "tab":
			a.tab += n
		}
		if requests > a.requests {
			a.requests = requests
		}
	}

	// Per-file authorship changelog (basename only).
	changeRows, err := db.Query(`
		SELECT conversationId, fileName, COALESCE(source, ''), COUNT(*) AS n
		FROM ai_code_hashes
		WHERE conversationId IS NOT NULL AND conversationId != ''
		  AND fileName IS NOT NULL AND fileName != ''
		GROUP BY conversationId, fileName, source
		ORDER BY n DESC
	`)
	if err == nil {
		defer changeRows.Close()
		for changeRows.Next() {
			var conversationID, fileName, source string
			var n int
			if changeRows.Scan(&conversationID, &fileName, &source, &n) != nil {
				continue
			}
			localID := "cursor:" + clip(conversationID, 120)
			if _, ok := byID[localID]; !ok {
				continue
			}
			base := basenameOnly(fileName)
			if base == "" {
				continue
			}
			src := "unknown"
			switch strings.ToLower(strings.TrimSpace(source)) {
			case "composer":
				src = "composer"
			case "human":
				src = "human"
			case "tab":
				src = "tab"
			}
			ev := ensureEvidence(evidence, localID)
			if len(ev.CapturedChanges) >= maxFileChangelog {
				continue
			}
			ev.CapturedChanges = append(ev.CapturedChanges, client.WorkTraceFileChange{
				File:   base,
				Op:     "edit",
				Source: src,
				Events: n,
			})
		}
	}

	// Top basenames by touch count (never upload absolute paths).
	fileRows, err := db.Query(`
		SELECT conversationId, fileName, COUNT(*) AS n
		FROM ai_code_hashes
		WHERE conversationId IS NOT NULL AND conversationId != ''
		  AND fileName IS NOT NULL AND fileName != ''
		GROUP BY conversationId, fileName
		ORDER BY n DESC
	`)
	if err == nil {
		defer fileRows.Close()
		seen := map[string]map[string]bool{}
		for fileRows.Next() {
			var conversationID, fileName string
			var n int
			if fileRows.Scan(&conversationID, &fileName, &n) != nil {
				continue
			}
			localID := "cursor:" + clip(conversationID, 120)
			if _, ok := byID[localID]; !ok {
				continue
			}
			base := basenameOnly(fileName)
			if base == "" {
				continue
			}
			ev := ensureEvidence(evidence, localID)
			if seen[localID] == nil {
				seen[localID] = map[string]bool{}
			}
			if seen[localID][base] || len(ev.PrimaryFiles) >= 8 {
				continue
			}
			seen[localID][base] = true
			ev.PrimaryFiles = append(ev.PrimaryFiles, base)
		}
	}

	for localID, a := range byConv {
		ev := ensureEvidence(evidence, localID)
		ev.HasAuthorship = true
		ev.AIEditEvents = a.ai
		ev.HumanEditEvents = a.human
		ev.TabEditEvents = a.tab
		ev.RequestCount = a.requests
	}
}

func enrichCursorModels(byID map[string]client.WorkSession) {
	dbPath := cursorAITrackingDBPath()
	if _, err := os.Stat(dbPath); err != nil {
		return
	}
	db, err := sql.Open("sqlite", "file:"+dbPath+"?mode=ro")
	if err != nil {
		return
	}
	defer db.Close()

	rows, err := db.Query(`
		SELECT conversationId, model, COUNT(*) AS n
		FROM ai_code_hashes
		WHERE conversationId IS NOT NULL AND conversationId != ''
		  AND model IS NOT NULL AND model != ''
		  AND source = 'composer'
		GROUP BY conversationId, model
	`)
	if err != nil {
		return
	}
	defer rows.Close()

	type pick struct {
		model string
		n     int
	}
	best := map[string]pick{}
	for rows.Next() {
		var conversationID, model string
		var n int
		if rows.Scan(&conversationID, &model, &n) != nil {
			continue
		}
		localID := "cursor:" + clip(conversationID, 120)
		if _, ok := byID[localID]; !ok {
			continue
		}
		prev, ok := best[localID]
		if !ok || n > prev.n {
			best[localID] = pick{model: model, n: n}
		}
	}
	for localID, pick := range best {
		session := byID[localID]
		if session.Model == "" {
			session.Model = clip(pick.model, 128)
			byID[localID] = session
		}
	}
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

func enrichCursorGit(byID map[string]client.WorkSession) {
	home, _ := os.UserHomeDir()
	for id, session := range byID {
		var candidates []string
		name := ""
		if session.Repository != nil && session.Repository.Name != "" {
			name = session.Repository.Name
		} else if session.Trace != nil && session.Trace.Location != nil {
			name = session.Trace.Location.Project
		}
		if name != "" && home != "" {
			for _, root := range []string{
				filepath.Join(home, "code"),
				filepath.Join(home, "src"),
				filepath.Join(home, "dev"),
				filepath.Join(home, "Developer"),
				filepath.Join(home, "Projects"),
				filepath.Join(home, "repos"),
			} {
				candidates = append(candidates, filepath.Join(root, name))
			}
		}
		cwd := ""
		for _, candidate := range candidates {
			if scan.IsPrivacyProtectedPath(candidate) {
				continue
			}
			if st, err := os.Stat(candidate); err == nil && st.IsDir() {
				cwd = candidate
				break
			}
		}
		if cwd == "" {
			continue
		}
		enrichSessionGit(&session, cwd)
		byID[id] = session
	}
}

func cursorProjectSlugFromTranscriptPath(path string) string {
	// ~/.cursor/projects/<slug>/agent-transcripts/<id>/<id>.jsonl
	parts := strings.Split(filepath.ToSlash(path), "/")
	for i, part := range parts {
		if part == "projects" && i+1 < len(parts) {
			return parts[i+1]
		}
	}
	return ""
}

func locationFromCursorProjectSlug(slug string) *client.WorkTraceLocation {
	slug = strings.TrimSpace(slug)
	if slug == "" {
		return nil
	}
	out := &client.WorkTraceLocation{
		Kind:    "local",
		Project: clip(cursorProjectLabel(slug), 128),
	}
	// Never Stat/git under Documents/Desktop/Downloads — that triggers macOS TCC
	// prompts. Prefer the slug label; only enrich repo for non-protected paths.
	if path := reconstructPathFromCursorSlug(slug); path != "" {
		if repo := repositoryFromLocalPath(path); repo != nil {
			out.Repository = repo
			if repo.Name != "" {
				out.Project = clip(repo.Name, 128)
			}
		}
	}
	return out
}

func cursorProjectLabel(slug string) string {
	slug = strings.TrimSpace(slug)
	if slug == "" {
		return ""
	}
	// Slugs look like Users-name-Documents-work-usejunciton — take the last segment.
	parts := strings.Split(slug, "-")
	if len(parts) == 0 {
		return slug
	}
	return parts[len(parts)-1]
}

func reconstructPathFromCursorSlug(slug string) string {
	home, _ := os.UserHomeDir()
	if home == "" || slug == "" {
		return ""
	}
	// Common macOS layout: Users-<user>-Documents-work-<repo>
	prefix := "Users-"
	if !strings.HasPrefix(slug, prefix) {
		return ""
	}
	rest := strings.TrimPrefix(slug, prefix)
	// Split user from the remainder at the first known home folder marker.
	for _, marker := range []string{"-Documents-", "-Desktop-", "-Downloads-", "-Developer-", "-Projects-", "-Code-", "-src-", "-repos-"} {
		idx := strings.Index(rest, marker)
		if idx <= 0 {
			continue
		}
		user := rest[:idx]
		tail := strings.ReplaceAll(rest[idx+1:], "-", string(filepath.Separator))
		candidate := filepath.Join("/Users", user, tail)
		if scan.IsPrivacyProtectedPath(candidate) {
			return ""
		}
		if st, err := os.Stat(candidate); err == nil && st.IsDir() {
			return candidate
		}
	}
	return ""
}

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

func cursorTimestamp(raw int64) time.Time {
	if raw <= 0 {
		return time.Time{}
	}
	if raw < 1_000_000_000_000 {
		return time.Unix(raw, 0)
	}
	return time.UnixMilli(raw)
}
