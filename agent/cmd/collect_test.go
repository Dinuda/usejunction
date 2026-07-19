package cmd

import (
	"testing"
	"time"

	"github.com/usejunction/agent/internal/config"
)

func TestForwardOnlyWorkOptionsStartsAtPolicyEpoch(t *testing.T) {
	cfg := &config.Config{WorkExtractionLastAt: "2025-01-01T00:00:00Z"}
	opts, changed, err := forwardOnlyWorkOptions("2026-07-19T10:00:00Z", cfg)
	if err != nil {
		t.Fatal(err)
	}
	if !changed || opts.NotBefore.Format(time.RFC3339) != "2026-07-19T10:00:00Z" {
		t.Fatalf("unexpected options: %#v changed=%v", opts, changed)
	}
	if !opts.Since.IsZero() || cfg.WorkExtractionLastAt != "" {
		t.Fatal("a new epoch must clear the old watermark without enabling historical collection")
	}
}

func TestForwardOnlyWorkOptionsRepairsMalformedWatermarkSafely(t *testing.T) {
	cfg := &config.Config{
		WorkExtractionStartedAt: "2026-07-19T10:00:00Z",
		WorkExtractionLastAt:    "not-a-time",
	}
	opts, changed, err := forwardOnlyWorkOptions("2026-07-19T10:00:00Z", cfg)
	if err != nil {
		t.Fatal(err)
	}
	if !changed || !opts.Since.IsZero() || cfg.WorkExtractionLastAt != "" {
		t.Fatalf("malformed watermark was not safely reset: %#v cfg=%#v", opts, cfg)
	}
	if opts.NotBefore.Format(time.RFC3339) != "2026-07-19T10:00:00Z" {
		t.Fatal("policy boundary must remain mandatory")
	}
}

func TestForwardOnlyWorkOptionsFailsClosedWithoutPolicyEpoch(t *testing.T) {
	if _, _, err := forwardOnlyWorkOptions("", &config.Config{}); err == nil {
		t.Fatal("missing policy epoch must fail closed")
	}
	if _, _, err := forwardOnlyWorkOptions("bad", &config.Config{}); err == nil {
		t.Fatal("malformed policy epoch must fail closed")
	}
}
