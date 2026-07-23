package workextract

import (
	"database/sql"
	"encoding/json"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/usejunction/agent/internal/client"
	"github.com/usejunction/agent/internal/scan"
	"github.com/usejunction/agent/internal/sqlitedb"
)

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
	return extractCursorComposerHeadersAt(cursorStateDBPath(), limit)
}

// extractCursorComposerHeadersAt reads composer session headers from Cursor's
// state.vscdb. Newer Cursor builds migrate headers into a dedicated
// composerHeaders table (see composer.composerHeaders.migratedToTable);
// older builds keep a JSON blob under ItemTable key composer.composerHeaders.
func extractCursorComposerHeadersAt(dbPath string, limit int) []client.WorkSession {
	if _, err := os.Stat(dbPath); err != nil {
		return nil
	}
	db, err := sqlitedb.OpenReadonly(dbPath)
	if err != nil {
		return nil
	}
	defer db.Close()

	if sessions := composerHeadersFromTable(db, limit); len(sessions) > 0 {
		return sessions
	}
	return composerHeadersFromItemTable(db, limit)
}

func composerHeadersFromTable(db *sql.DB, limit int) []client.WorkSession {
	rows, err := db.Query(`
		SELECT value FROM composerHeaders
		WHERE COALESCE(isArchived, 0) = 0
		ORDER BY COALESCE(recency, lastUpdatedAt, createdAt) DESC
	`)
	if err != nil {
		return nil
	}
	defer rows.Close()

	var headers []composerHeader
	for rows.Next() {
		var raw string
		if rows.Scan(&raw) != nil || strings.TrimSpace(raw) == "" {
			continue
		}
		var header composerHeader
		if json.Unmarshal([]byte(raw), &header) != nil {
			continue
		}
		headers = append(headers, header)
	}
	if len(headers) == 0 {
		return nil
	}
	return composerHeadersToSessions(headers, limit)
}

func composerHeadersFromItemTable(db *sql.DB, limit int) []client.WorkSession {
	var raw string
	err := db.QueryRow(`SELECT value FROM ItemTable WHERE key = 'composer.composerHeaders'`).Scan(&raw)
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
