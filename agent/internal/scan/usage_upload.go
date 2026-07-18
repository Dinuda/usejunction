package scan

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/usejunction/agent/internal/config"
	"github.com/usejunction/agent/internal/types"
)

type usageUploadStore struct {
	Fingerprints map[string]string `json:"fingerprints"`
}

func usageUploadPath() string {
	return filepath.Join(config.CacheDir(), "usage-upload.json")
}

func usageRowKey(row types.DailyUsage) string {
	source := row.Source
	if source == "" {
		source = "local_scan"
	}
	return fmt.Sprintf("%s|%s|%s|%s", row.ToolName, row.Date, row.Model, source)
}

func usageRowFingerprint(row types.DailyUsage) string {
	ai := ""
	if row.AiPercent != nil {
		ai = fmt.Sprintf("%.4f", *row.AiPercent)
	}
	return fmt.Sprintf(
		"in:%d,out:%d,cr:%d,cw:%d,r:%d,cost:%.6f,sug:%d,acc:%d,add:%d,del:%d,com:%d,ai:%s,req:%d,v:%v,mk:%s",
		row.InputTokens,
		row.OutputTokens,
		row.CacheReadTokens,
		row.CacheWriteTokens,
		row.ReasoningTokens,
		row.EstimatedCost,
		row.SuggestedLines,
		row.AcceptedLines,
		row.AddedLines,
		row.DeletedLines,
		row.Commits,
		ai,
		row.Requests,
		row.Verified,
		row.MetricKind,
	)
}

func loadUsageUploadStore() usageUploadStore {
	data, err := os.ReadFile(usageUploadPath())
	if err != nil {
		return usageUploadStore{Fingerprints: map[string]string{}}
	}
	var store usageUploadStore
	if json.Unmarshal(data, &store) != nil || store.Fingerprints == nil {
		return usageUploadStore{Fingerprints: map[string]string{}}
	}
	return store
}

func saveUsageUploadStore(store usageUploadStore) error {
	if store.Fingerprints == nil {
		store.Fingerprints = map[string]string{}
	}
	path := usageUploadPath()
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return err
	}
	b, err := json.MarshalIndent(store, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, b, 0600)
}

// FilterUsageUploadDelta returns aggregates that should be uploaded:
// every row for today (UTC), plus older rows whose fingerprint changed.
// Fingerprints live at ~/.usejunction/cache/cost-usage/usage-upload.json.
func FilterUsageUploadDelta(rows []types.DailyUsage, now time.Time) []types.DailyUsage {
	if len(rows) == 0 {
		return nil
	}
	today := now.UTC().Format("2006-01-02")
	store := loadUsageUploadStore()
	out := make([]types.DailyUsage, 0, len(rows))
	for _, row := range rows {
		key := usageRowKey(row)
		fp := usageRowFingerprint(row)
		if row.Date == today || store.Fingerprints[key] != fp {
			out = append(out, row)
		}
	}
	return out
}

// RememberUsageUpload marks successfully uploaded rows so unchanged history
// is skipped on the next collect.
func RememberUsageUpload(rows []types.DailyUsage) error {
	if len(rows) == 0 {
		return nil
	}
	store := loadUsageUploadStore()
	for _, row := range rows {
		store.Fingerprints[usageRowKey(row)] = usageRowFingerprint(row)
	}
	return saveUsageUploadStore(store)
}
