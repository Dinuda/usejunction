package scan

import (
	"sort"
	"time"

	"github.com/usejunction/agent/internal/types"
)

// UsageLookbackDays is the hard cap for local usage history we will upload.
// Older rows are ignored so cold backfills cannot stall sync forever.
const UsageLookbackDays = 60 // ~2 months

// UsageUploadBatchSize is how many aggregates one control-plane POST carries.
// Larger batches cut HTTP round-trips; chunk route caps body at 1 MB (Hobby-safe).
const UsageUploadBatchSize = 200

// UsageUploadMaxBatchesPerSync caps how much of the pending queue one collect
// cycle drains in steady state. Remaining rows finish on later heartbeats /
// Sync now runs via server fingerprints.
const UsageUploadMaxBatchesPerSync = 8

// UsageUploadMaxBatchesPerSyncFirst raises the first-sync / force-full budget
// so ~5k partitions typically finish in one pass (200 × 25).
const UsageUploadMaxBatchesPerSyncFirst = 25

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

// SortUsageNewestFirst orders rows newest-first so a partial drain still lands
// recent traffic immediately.
func SortUsageNewestFirst(rows []types.DailyUsage) {
	sort.SliceStable(rows, func(i, j int) bool {
		if rows[i].Date == rows[j].Date {
			return rows[i].ToolName < rows[j].ToolName
		}
		return rows[i].Date > rows[j].Date
	})
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
