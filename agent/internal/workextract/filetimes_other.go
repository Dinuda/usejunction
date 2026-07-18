//go:build !darwin

package workextract

import (
	"os"
	"time"
)

func fileBirthOrMod(path string, fallback time.Time) time.Time {
	info, err := os.Stat(path)
	if err != nil {
		return fallback
	}
	// Non-macOS: best-effort start ≈ modtime when JSONL has no timestamps.
	_ = info
	return fallback
}
