package cmd

import (
	"testing"
	"time"
)

func TestUsageRunTrackerIsDueAfterThirtyMinutes(t *testing.T) {
	var tracker usageRunTracker
	now := time.Date(2026, 7, 19, 19, 0, 0, 0, time.UTC)

	if !tracker.due(now, collectionInterval) {
		t.Fatal("a daemon with no successful usage run must collect on heartbeat")
	}

	tracker.markSuccessful(now)
	if tracker.due(now.Add(collectionInterval-time.Second), collectionInterval) {
		t.Fatal("a usage run from the last 30 minutes must suppress a catch-up collect")
	}
	if !tracker.due(now.Add(collectionInterval), collectionInterval) {
		t.Fatal("a usage run that is 30 minutes old must be collected again")
	}

	tracker.markSuccessful(now.Add(10 * time.Minute))
	tracker.markSuccessful(now.Add(5 * time.Minute))
	if tracker.due(now.Add(39*time.Minute), collectionInterval) {
		t.Fatal("an older concurrent run must not replace the latest successful run")
	}
}
