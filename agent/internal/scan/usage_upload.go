package scan

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/usejunction/agent/internal/config"
	"github.com/usejunction/agent/internal/types"
)

// UsageLookbackDays is the hard cap for local usage history we will upload.
// Older rows are ignored so cold backfills cannot stall sync forever.
const UsageLookbackDays = 60 // ~2 months

// UsageUploadBatchSize is how many aggregates one control-plane POST carries.
// Dense Codex upserts are hundreds of ms each; keep this small.
const UsageUploadBatchSize = 50

// UsageUploadMaxBatchesPerSync caps how much of the pending queue one collect
// cycle drains. Remaining rows stay pending via fingerprints and finish on
// later heartbeats / Sync now runs.
const UsageUploadMaxBatchesPerSync = 8

// UsageUploadConcurrency is how many batch POSTs run at once. Keep modest so
// the control-plane upsert loop is not saturated by one agent.
const UsageUploadConcurrency = 4

// SplitUsageUploadBatches partitions rows into fixed-size upload batches.
func SplitUsageUploadBatches(rows []types.DailyUsage, batchSize int) [][]types.DailyUsage {
	if len(rows) == 0 {
		return nil
	}
	if batchSize <= 0 {
		batchSize = UsageUploadBatchSize
	}
	out := make([][]types.DailyUsage, 0, (len(rows)+batchSize-1)/batchSize)
	for start := 0; start < len(rows); start += batchSize {
		end := start + batchSize
		if end > len(rows) {
			end = len(rows)
		}
		out = append(out, rows[start:end])
	}
	return out
}

// usageUploadStore tracks which aggregates were accepted by the control plane
// for a specific enrolled device. Fingerprints are never global across
// re-enrolls — a stale store from a revoked device would skip re-upload into
// an empty database.
type usageUploadStore struct {
	OrgID        string            `json:"orgId,omitempty"`
	DeviceID     string            `json:"deviceId,omitempty"`
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

// ClearUsageUploadStore deletes upload fingerprints. Call on enroll so a new
// device never inherits "already uploaded" state from a prior enrollment.
func ClearUsageUploadStore() error {
	path := usageUploadPath()
	if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}

// bindUsageUploadStore returns fingerprints only when they belong to this
// enrollment. A device/org mismatch (re-enroll, workspace switch) starts clean
// so history is re-uploaded into the new device rows.
func bindUsageUploadStore(orgID, deviceID string) usageUploadStore {
	store := loadUsageUploadStore()
	if orgID == "" || deviceID == "" {
		return usageUploadStore{OrgID: orgID, DeviceID: deviceID, Fingerprints: map[string]string{}}
	}
	if store.OrgID != orgID || store.DeviceID != deviceID {
		return usageUploadStore{OrgID: orgID, DeviceID: deviceID, Fingerprints: map[string]string{}}
	}
	return store
}

// UsageLookbackStart returns the inclusive UTC calendar day for the lookback
// window (today minus UsageLookbackDays).
func UsageLookbackStart(now time.Time) time.Time {
	day := now.UTC().Truncate(24 * time.Hour)
	return day.AddDate(0, 0, -UsageLookbackDays)
}

// FilterUsageLookback drops rows older than the hard upload cap.
func FilterUsageLookback(rows []types.DailyUsage, now time.Time) []types.DailyUsage {
	if len(rows) == 0 {
		return nil
	}
	cutoff := UsageLookbackStart(now).Format("2006-01-02")
	out := make([]types.DailyUsage, 0, len(rows))
	for _, row := range rows {
		if row.Date == "" || row.Date < cutoff {
			continue
		}
		out = append(out, row)
	}
	return out
}

// FilterUsageUploadDelta returns aggregates that should be uploaded:
// every row for today (UTC), plus older in-window rows whose fingerprint changed
// for this org/device. Fingerprints live at
// ~/.usejunction/cache/cost-usage/usage-upload.json and are enrollment-scoped.
// Rows outside the 2-month lookback are never queued.
func FilterUsageUploadDelta(rows []types.DailyUsage, now time.Time, orgID, deviceID string) []types.DailyUsage {
	rows = FilterUsageLookback(rows, now)
	if len(rows) == 0 {
		return nil
	}
	today := now.UTC().Format("2006-01-02")
	store := bindUsageUploadStore(orgID, deviceID)
	out := make([]types.DailyUsage, 0, len(rows))
	for _, row := range rows {
		key := usageRowKey(row)
		fp := usageRowFingerprint(row)
		if row.Date == today || store.Fingerprints[key] != fp {
			out = append(out, row)
		}
	}
	// Newest first so a partial drain still lands recent traffic immediately.
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].Date == out[j].Date {
			return out[i].ToolName < out[j].ToolName
		}
		return out[i].Date > out[j].Date
	})
	return out
}

// TakeUsageUploadBatch slices the next drain window from a pending queue.
// remaining is whatever should wait for a later sync cycle.
func TakeUsageUploadBatch(pending []types.DailyUsage, batchSize, maxBatches int) (batch []types.DailyUsage, remaining []types.DailyUsage) {
	if batchSize <= 0 {
		batchSize = UsageUploadBatchSize
	}
	if maxBatches <= 0 {
		maxBatches = UsageUploadMaxBatchesPerSync
	}
	limit := batchSize * maxBatches
	if len(pending) <= limit {
		return pending, nil
	}
	return pending[:limit], pending[limit:]
}

// RememberUsageUpload marks successfully uploaded rows so unchanged history
// is skipped on the next collect for this enrollment only.
func RememberUsageUpload(rows []types.DailyUsage, orgID, deviceID string) error {
	if len(rows) == 0 {
		return nil
	}
	store := bindUsageUploadStore(orgID, deviceID)
	store.OrgID = orgID
	store.DeviceID = deviceID
	cutoff := UsageLookbackStart(time.Now().UTC()).Format("2006-01-02")
	for key := range store.Fingerprints {
		// key = tool|date|model|source — drop fingerprints outside lookback.
		parts := strings.Split(key, "|")
		if len(parts) >= 2 && parts[1] < cutoff {
			delete(store.Fingerprints, key)
		}
	}
	for _, row := range rows {
		store.Fingerprints[usageRowKey(row)] = usageRowFingerprint(row)
	}
	return saveUsageUploadStore(store)
}
