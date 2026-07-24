package workextract

import (
	"database/sql"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/usejunction/agent/internal/client"
	"github.com/usejunction/agent/internal/scan"
	"github.com/usejunction/agent/internal/sqlitedb"
)

const opencodeWorkSource = "opencode_sessions"

// extractOpenCode builds Signals work sessions from OpenCode's local session index.
// It never reads prompt bodies or message text.
func extractOpenCode() []client.WorkSession {
	dbPath := scan.OpenCodeDBPath()
	if dbPath == "" {
		return nil
	}
	if _, err := os.Stat(dbPath); err != nil {
		return nil
	}

	db, err := sqlitedb.OpenReadonly(dbPath)
	if err != nil {
		return nil
	}
	defer db.Close()

	rows, err := db.Query(`
		SELECT
			s.id,
			s.title,
			s.directory,
			s.model,
			s.time_created,
			s.time_updated,
			s.summary_additions,
			s.summary_deletions,
			s.summary_files,
			COALESCE(p.worktree, '') AS worktree,
			COALESCE(p.name, '') AS project_name
		FROM session s
		LEFT JOIN project p ON p.id = s.project_id
		ORDER BY s.time_updated DESC
		LIMIT ?
	`, maxSessionsIncremental)
	if err != nil {
		return nil
	}
	defer rows.Close()

	out := make([]client.WorkSession, 0)
	for rows.Next() {
		var (
			id, title, directory, modelJSON, worktree, projectName string
			createdMs, updatedMs                                    int64
			additions, deletions, files                               sql.NullInt64
		)
		if err := rows.Scan(
			&id, &title, &directory, &modelJSON, &createdMs, &updatedMs,
			&additions, &deletions, &files, &worktree, &projectName,
		); err != nil {
			continue
		}
		session := opencodeSessionToWorkSession(
			id, title, directory, modelJSON, worktree, projectName,
			createdMs, updatedMs, additions, deletions, files,
		)
		if !hasWorkSignal(session) {
			continue
		}
		out = append(out, session)
	}
	return out
}

func opencodeSessionToWorkSession(
	id, title, directory, modelJSON, worktree, projectName string,
	createdMs, updatedMs int64,
	additions, deletions, files sql.NullInt64,
) client.WorkSession {
	updated := msToTime(updatedMs)
	created := msToTime(createdMs)
	observed := updated
	if observed.IsZero() {
		observed = created
	}

	session := client.WorkSession{
		LocalID:    "opencode:" + strings.TrimSpace(id),
		ToolName:   "opencode",
		Title:      clip(title, 160),
		Model:      opencodeWorkModel(modelJSON),
		StartedAt:  rfc3339OrEmpty(created),
		EndedAt:    rfc3339OrEmpty(updated),
		ObservedAt: observedFallback(observed),
		Source:     opencodeWorkSource,
		Trace:      &client.WorkTrace{},
	}

	project := opencodeWorkProject(directory, worktree, projectName)
	if project != "" {
		session.Trace.Location = &client.WorkTraceLocation{
			Kind:    "workspace",
			Project: project,
		}
	}

	stats := opencodeWorkStats(additions, deletions, files)
	if stats != nil {
		session.Trace.Stats = stats
	}
	return session
}

func opencodeWorkModel(modelJSON string) string {
	modelJSON = strings.TrimSpace(modelJSON)
	if modelJSON == "" {
		return ""
	}
	var parsed struct {
		ID         string `json:"id"`
		ProviderID string `json:"providerID"`
	}
	if json.Unmarshal([]byte(modelJSON), &parsed) != nil {
		return clip(modelJSON, 128)
	}
	provider := strings.TrimSpace(parsed.ProviderID)
	model := strings.TrimSpace(parsed.ID)
	switch {
	case provider != "" && model != "":
		return provider + "/" + model
	case model != "":
		return model
	case provider != "":
		return provider
	default:
		return ""
	}
}

func opencodeWorkProject(directory, worktree, projectName string) string {
	if name := strings.TrimSpace(projectName); name != "" {
		return clip(name, 128)
	}
	for _, candidate := range []string{directory, worktree} {
		candidate = strings.TrimSpace(candidate)
		if candidate == "" || scan.IsPrivacyProtectedPath(candidate) {
			continue
		}
		base := filepath.Base(candidate)
		if base != "" && base != "." && base != string(filepath.Separator) {
			return clip(base, 128)
		}
	}
	return ""
}

func opencodeWorkStats(additions, deletions, files sql.NullInt64) *client.WorkTraceStats {
	stats := &client.WorkTraceStats{}
	if additions.Valid && additions.Int64 > 0 {
		stats.LinesAdded = int(additions.Int64)
	}
	if deletions.Valid && deletions.Int64 > 0 {
		stats.LinesRemoved = int(deletions.Int64)
	}
	if files.Valid && files.Int64 > 0 {
		stats.FilesChanged = int(files.Int64)
	}
	if stats.LinesAdded+stats.LinesRemoved+stats.FilesChanged == 0 {
		return nil
	}
	return stats
}

func msToTime(ms int64) time.Time {
	if ms <= 0 {
		return time.Time{}
	}
	return time.UnixMilli(ms).UTC()
}
