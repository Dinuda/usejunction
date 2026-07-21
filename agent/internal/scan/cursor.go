package scan

import (
	"database/sql"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/usejunction/agent/internal/config"
	"github.com/usejunction/agent/internal/platformdirs"
	"github.com/usejunction/agent/internal/sqlitedb"
	"github.com/usejunction/agent/internal/types"
)

const cursorLocalSource = "cursor_local"

// cursorStateDBPathOverride is set by tests to point at a fixture state.vscdb.
var cursorStateDBPathOverride string

func cursorStateDBPath() string {
	if cursorStateDBPathOverride != "" {
		return cursorStateDBPathOverride
	}
	return filepath.Join(platformdirs.CursorUserDir(), "globalStorage", "state.vscdb")
}

func cursorAITrackingDBPath() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".cursor", "ai-tracking", "ai-code-tracking.db")
}

func cursorLocalSourceKeys() (map[string]SourceWatermark, []string) {
	paths := []string{cursorStateDBPath(), cursorAITrackingDBPath()}
	current := map[string]SourceWatermark{}
	keys := make([]string, 0, len(paths))
	for _, path := range paths {
		wm, err := FileWatermark(path)
		if err != nil {
			continue
		}
		key := "sqlite:" + path
		current[key] = wm
		keys = append(keys, key)
	}
	return current, keys
}

// ScanCursorLocal harvests WakaTime-style AI line metrics and model attribution
// from Cursor's local sqlite stores (User/globalStorage/state.vscdb and
// ~/.cursor/ai-tracking/ai-code-tracking.db). It never reads prompt text.
// When forceFull is false and both sqlite files are unchanged, prior aggregates
// are reused from the scan snapshot.
func ScanCursorLocal(forceFull bool) ([]types.DailyUsage, error) {
	cacheFile := filepath.Join(config.CacheDir(), "cursor-local.json")
	current, keys := cursorLocalSourceKeys()
	snap, _ := LoadScanSnapshot()
	if !forceFull && SQLiteSourcesUnchanged(snap, current, keys) {
		if rows := AggregatesForSource(snap, "cursor", cursorLocalSource); len(rows) > 0 || len(keys) == 0 {
			return rows, nil
		}
	}

	buckets := map[string]*types.DailyUsage{}

	_ = scanCursorDailyStats(buckets)
	_ = scanCursorAICodeHashes(buckets)
	_ = scanCursorScoredCommits(buckets)

	result := make([]types.DailyUsage, 0, len(buckets))
	for _, b := range buckets {
		if b.Source == "" {
			b.Source = cursorLocalSource
		}
		result = append(result, *b)
	}
	result = PruneAggregatesLookback(result, time.Now().UTC())
	_ = saveCache(cacheFile, result)
	snap.Aggregates = ReplaceSourceAggregates(snap.Aggregates, "cursor", cursorLocalSource, result)
	if snap.Sources == nil {
		snap.Sources = map[string]SourceWatermark{}
	}
	for key := range snap.Sources {
		if strings.HasPrefix(key, "sqlite:") {
			if _, ok := current[key]; !ok {
				delete(snap.Sources, key)
			}
		}
	}
	for key, wm := range current {
		snap.Sources[key] = wm
	}
	_ = SaveScanSnapshot(snap)
	return result, nil
}

func cursorBucket(buckets map[string]*types.DailyUsage, date, model string) *types.DailyUsage {
	if model == "" {
		model = "unknown"
	}
	key := date + "|" + model
	if buckets[key] == nil {
		buckets[key] = &types.DailyUsage{
			Date: date, ToolName: "cursor", Model: model, Source: "cursor_local",
			MetricKind: types.MetricKindProductivity, Requests: 0,
		}
	}
	return buckets[key]
}

func scanCursorDailyStats(buckets map[string]*types.DailyUsage) error {
	return scanCursorDailyStatsAt(cursorStateDBPath(), buckets)
}

func scanCursorDailyStatsAt(dbPath string, buckets map[string]*types.DailyUsage) error {
	if _, err := os.Stat(dbPath); err != nil {
		return err
	}
	db, err := sqlitedb.OpenReadonly(dbPath)
	if err != nil {
		return err
	}
	defer db.Close()

	rows, err := db.Query(`SELECT key, value FROM ItemTable WHERE key LIKE 'aiCodeTracking.dailyStats.%'`)
	if err != nil {
		return err
	}
	defer rows.Close()

	for rows.Next() {
		var key, value string
		if err := rows.Scan(&key, &value); err != nil {
			continue
		}
		var stats struct {
			Date                   string `json:"date"`
			TabSuggestedLines      int    `json:"tabSuggestedLines"`
			TabAcceptedLines       int    `json:"tabAcceptedLines"`
			ComposerSuggestedLines int    `json:"composerSuggestedLines"`
			ComposerAcceptedLines  int    `json:"composerAcceptedLines"`
		}
		if json.Unmarshal([]byte(value), &stats) != nil || stats.Date == "" {
			continue
		}
		suggested := stats.TabSuggestedLines + stats.ComposerSuggestedLines
		accepted := stats.TabAcceptedLines + stats.ComposerAcceptedLines
		if suggested+accepted == 0 {
			continue
		}
		b := cursorBucket(buckets, stats.Date, "ai-lines")
		b.SuggestedLines += suggested
		b.AcceptedLines += accepted
		b.MetricKind = types.MetricKindProductivity
		b.Requests = 0
	}
	return rows.Err()
}

func scanCursorAICodeHashes(buckets map[string]*types.DailyUsage) error {
	dbPath := cursorAITrackingDBPath()
	if _, err := os.Stat(dbPath); err != nil {
		return err
	}
	db, err := sqlitedb.OpenReadonly(dbPath)
	if err != nil {
		return err
	}
	defer db.Close()

	rows, err := db.Query(`
		SELECT COALESCE(model, 'unknown') AS model,
		       date(createdAt/1000, 'unixepoch') AS day,
		       COUNT(*) AS n
		FROM ai_code_hashes
		WHERE source = 'composer' AND createdAt IS NOT NULL
		GROUP BY model, day
	`)
	if err != nil {
		return err
	}
	defer rows.Close()

	for rows.Next() {
		var model, day string
		var n int
		if err := rows.Scan(&model, &day, &n); err != nil {
			continue
		}
		if day == "" || n <= 0 {
			continue
		}
		b := cursorBucket(buckets, day, model)
		b.AddedLines += n
		b.Requests = 0
	}
	return rows.Err()
}

func scanCursorScoredCommits(buckets map[string]*types.DailyUsage) error {
	dbPath := cursorAITrackingDBPath()
	if _, err := os.Stat(dbPath); err != nil {
		return err
	}
	db, err := sqlitedb.OpenReadonly(dbPath)
	if err != nil {
		return err
	}
	defer db.Close()

	rows, err := db.Query(`
		SELECT COALESCE(substr(commitDate, 1, 10), date(scoredAt/1000, 'unixepoch')) AS day,
		       SUM(composerLinesAdded) AS added,
		       SUM(composerLinesDeleted) AS deleted,
		       SUM(tabLinesAdded) AS tabAdded,
		       COUNT(*) AS commits,
		       AVG(CAST(v2AiPercentage AS REAL)) AS aiPct
		FROM scored_commits
		GROUP BY day
	`)
	if err != nil {
		return err
	}
	defer rows.Close()

	for rows.Next() {
		var day string
		var added, deleted, tabAdded, commits sql.NullInt64
		var aiPct sql.NullFloat64
		if err := rows.Scan(&day, &added, &deleted, &tabAdded, &commits, &aiPct); err != nil {
			continue
		}
		day = strings.TrimSpace(day)
		if len(day) >= 10 {
			day = day[:10]
		}
		if day == "" {
			continue
		}
		b := cursorBucket(buckets, day, "commits")
		b.AddedLines += int(added.Int64 + tabAdded.Int64)
		b.DeletedLines += int(deleted.Int64)
		b.Commits += int(commits.Int64)
		if aiPct.Valid {
			v := aiPct.Float64
			b.AiPercent = &v
		}
		b.Requests = 0
	}
	return rows.Err()
}

// MergeCursorUsage merges local AI-line rows with verified usage-event rows.
// Event rows (with tokens/cost) take precedence for the same date+model when verified.
func MergeCursorUsage(local, events []types.DailyUsage) []types.DailyUsage {
	if len(events) == 0 {
		return local
	}
	if len(local) == 0 {
		return events
	}
	out := make([]types.DailyUsage, 0, len(local)+len(events))
	seen := map[string]bool{}
	for _, e := range events {
		key := e.Date + "|" + e.Model + "|" + e.Source
		seen[key] = true
		out = append(out, e)
	}
	for _, l := range local {
		key := l.Date + "|" + l.Model + "|" + l.Source
		if seen[key] {
			continue
		}
		// Keep AI-line / commit attribution rows even when events exist.
		out = append(out, l)
	}
	return out
}
