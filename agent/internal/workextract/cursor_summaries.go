package workextract

import (
	"encoding/json"
	"os"
	"strings"

	"github.com/usejunction/agent/internal/client"
	"github.com/usejunction/agent/internal/sqlitedb"
)

func extractCursorConversationSummaries(limit int) []client.WorkSession {
	dbPath := cursorAITrackingDBPath()
	if _, err := os.Stat(dbPath); err != nil {
		return nil
	}
	db, err := sqlitedb.OpenReadonly(dbPath)
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
