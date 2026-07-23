package workextract

import (
	"os"
	"strings"

	"github.com/usejunction/agent/internal/client"
	"github.com/usejunction/agent/internal/sqlitedb"
)

func enrichCursorAuthorship(byID map[string]client.WorkSession, evidence map[string]*understandingEvidence) {
	dbPath := cursorAITrackingDBPath()
	if _, err := os.Stat(dbPath); err != nil {
		return
	}
	db, err := sqlitedb.OpenReadonly(dbPath)
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
	db, err := sqlitedb.OpenReadonly(dbPath)
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
