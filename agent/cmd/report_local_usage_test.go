package cmd

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/usejunction/agent/internal/client"
	"github.com/usejunction/agent/internal/config"
	"github.com/usejunction/agent/internal/scan"
	"github.com/usejunction/agent/internal/types"
)

func setupCmdUsageHome(t *testing.T) *config.Config {
	t.Helper()
	dir := t.TempDir()
	t.Setenv("HOME", dir)
	t.Setenv("USERPROFILE", dir)
	if err := os.MkdirAll(filepath.Join(dir, ".usejunction", "cache", "cost-usage"), 0700); err != nil {
		t.Fatal(err)
	}
	cfg := &config.Config{
		ControlPlaneURL: "http://example.invalid",
		DeviceToken:     "tok",
		DeviceID:        "device-1",
		UserID:          "user-1",
		OrgID:           "org-1",
	}
	return cfg
}

func TestReportLocalUsageDeltaTwoRunsInitialAndResync(t *testing.T) {
	cfg := setupCmdUsageHome(t)

	var mu sync.Mutex
	store := map[string]float64{} // key -> estimated cost
	var posts atomic.Int32

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/ingest/local-usage" {
			http.NotFound(w, r)
			return
		}
		posts.Add(1)
		var body struct {
			Aggregates []client.UsageAggregate `json:"aggregates"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "bad json", 400)
			return
		}
		mu.Lock()
		for _, row := range body.Aggregates {
			key := fmt.Sprintf("%s|%s|%s|%s", row.ToolName, row.Date, row.Model, row.Source)
			store[key] = row.EstimatedCost
		}
		n := len(body.Aggregates)
		mu.Unlock()
		_ = json.NewEncoder(w).Encode(map[string]any{"upserted": n})
	}))
	defer server.Close()
	cfg.ControlPlaneURL = server.URL
	api := client.New(cfg)

	history := []client.UsageAggregate{
		{Date: "2026-07-20", ToolName: "cursor", Model: "composer-2.5", EstimatedCost: 2.87, InputTokens: 100, Source: "cursor_usage_events"},
		{Date: "2026-07-19", ToolName: "codex", Model: "gpt-5.6-sol", EstimatedCost: 144.9, InputTokens: 1_000_000, Source: "local_scan"},
		{Date: "2026-07-18", ToolName: "cursor", Model: "cursor-grok-4.5-high", EstimatedCost: 42.2, InputTokens: 500_000, Source: "cursor_usage_events"},
		{Date: time.Now().UTC().Format("2006-01-02"), ToolName: "cursor", Model: "today", EstimatedCost: 1.0, InputTokens: 10, Source: "cursor_usage_events"},
	}

	// Run 1 — initial ingest.
	uploaded1, remaining1, err := reportLocalUsageDelta(api, cfg, history, nil)
	if err != nil {
		t.Fatalf("run1: %v", err)
	}
	if uploaded1 != len(history) {
		t.Fatalf("run1 uploaded=%d want %d remaining=%d", uploaded1, len(history), remaining1)
	}
	mu.Lock()
	if len(store) != len(history) {
		t.Fatalf("run1 server store=%d want %d", len(store), len(history))
	}
	mu.Unlock()
	postsAfter1 := posts.Load()

	// Run 2 — identical resync must not re-POST historical rows (today may re-send).
	uploaded2, remaining2, err := reportLocalUsageDelta(api, cfg, history, nil)
	if err != nil {
		t.Fatalf("run2: %v", err)
	}
	if remaining2 != 0 {
		t.Fatalf("run2 remaining=%d", remaining2)
	}
	// Today always re-uploads; historical must be skipped.
	if uploaded2 > 1 {
		t.Fatalf("run2 uploaded=%d; expected at most today's row", uploaded2)
	}
	if posts.Load() <= postsAfter1 && uploaded2 > 0 {
		t.Fatalf("run2 should have POSTed today if uploaded>0")
	}
	if uploaded2 == 0 && posts.Load() != postsAfter1 {
		t.Fatalf("run2 posted without uploading")
	}

	mu.Lock()
	gotCost := store["cursor|2026-07-20|composer-2.5|cursor_usage_events"]
	mu.Unlock()
	if gotCost != 2.87 {
		t.Fatalf("server lost Jul20 cost: %v", gotCost)
	}
}

func TestReportLocalUsageDeltaDoesNotFingerprintOn413(t *testing.T) {
	cfg := setupCmdUsageHome(t)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, `{"error":"request body too large"}`, http.StatusRequestEntityTooLarge)
	}))
	defer server.Close()
	cfg.ControlPlaneURL = server.URL
	api := client.New(cfg)

	rows := []client.UsageAggregate{
		{Date: "2026-07-20", ToolName: "codex", Model: "gpt", EstimatedCost: 10, InputTokens: 100, Source: "local_scan"},
	}
	uploaded, _, err := reportLocalUsageDelta(api, cfg, rows, nil)
	if err == nil {
		t.Fatal("expected 413 error")
	}
	if uploaded != 0 {
		t.Fatalf("uploaded=%d on 413", uploaded)
	}
	pending := scan.FilterUsageUploadDelta([]types.DailyUsage{{
		Date: "2026-07-20", ToolName: "codex", Model: "gpt", EstimatedCost: 10, InputTokens: 100, Source: "local_scan",
	}}, time.Date(2026, 7, 21, 12, 0, 0, 0, time.UTC), cfg.OrgID, cfg.DeviceID)
	if len(pending) != 1 {
		t.Fatalf("413 must leave row pending, got %#v", pending)
	}
}

func TestReportLocalUsageDeltaBisectsMultiRow413(t *testing.T) {
	cfg := setupCmdUsageHome(t)
	var posts atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		posts.Add(1)
		var body struct {
			Aggregates []client.UsageAggregate `json:"aggregates"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "bad json", 400)
			return
		}
		if len(body.Aggregates) > 1 {
			http.Error(w, `{"error":"request body too large"}`, http.StatusRequestEntityTooLarge)
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"upserted": len(body.Aggregates)})
	}))
	defer server.Close()
	cfg.ControlPlaneURL = server.URL
	api := client.New(cfg)

	rows := []client.UsageAggregate{
		{Date: "2026-07-18", ToolName: "codex", Model: "a", EstimatedCost: 1, InputTokens: 10, Source: "local_scan"},
		{Date: "2026-07-18", ToolName: "codex", Model: "b", EstimatedCost: 2, InputTokens: 20, Source: "local_scan"},
		{Date: "2026-07-18", ToolName: "codex", Model: "c", EstimatedCost: 3, InputTokens: 30, Source: "local_scan"},
	}
	uploaded, remaining, err := reportLocalUsageDelta(api, cfg, rows, nil)
	if err != nil {
		t.Fatalf("expected bisect to succeed: %v", err)
	}
	if uploaded != 3 || remaining != 0 {
		t.Fatalf("uploaded=%d remaining=%d want 3/0", uploaded, remaining)
	}
	if posts.Load() < 3 {
		t.Fatalf("expected bisect POSTs, got %d", posts.Load())
	}
	pending := scan.FilterUsageUploadDelta([]types.DailyUsage{
		{Date: "2026-07-18", ToolName: "codex", Model: "a", EstimatedCost: 1, InputTokens: 10, Source: "local_scan"},
		{Date: "2026-07-18", ToolName: "codex", Model: "b", EstimatedCost: 2, InputTokens: 20, Source: "local_scan"},
		{Date: "2026-07-18", ToolName: "codex", Model: "c", EstimatedCost: 3, InputTokens: 30, Source: "local_scan"},
	}, time.Date(2026, 7, 21, 12, 0, 0, 0, time.UTC), cfg.OrgID, cfg.DeviceID)
	if len(pending) != 0 {
		t.Fatalf("accepted rows should be fingerprinted, pending=%#v", pending)
	}
}

func TestReportLocalUsageDeltaDoesNotFingerprintOn500(t *testing.T) {
	cfg := setupCmdUsageHome(t)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, `{"error":"local-usage ingest failed"}`, http.StatusInternalServerError)
	}))
	defer server.Close()
	cfg.ControlPlaneURL = server.URL
	api := client.New(cfg)

	rows := []client.UsageAggregate{
		{Date: "2026-07-19", ToolName: "cursor", Model: "composer-2.5", EstimatedCost: 2.87, Source: "cursor_usage_events"},
	}
	uploaded, _, err := reportLocalUsageDelta(api, cfg, rows, nil)
	if err == nil || uploaded != 0 {
		t.Fatalf("expected 500 with uploaded=0, got uploaded=%d err=%v", uploaded, err)
	}
}

func TestReportLocalUsageDeltaDoesNotFingerprintUpsertedZero(t *testing.T) {
	cfg := setupCmdUsageHome(t)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{"upserted": 0})
	}))
	defer server.Close()
	cfg.ControlPlaneURL = server.URL
	api := client.New(cfg)

	rows := []client.UsageAggregate{
		{Date: "2026-07-19", ToolName: "codex", Model: "gpt", EstimatedCost: 5, Source: "local_scan"},
	}
	uploaded, _, err := reportLocalUsageDelta(api, cfg, rows, nil)
	if err == nil || uploaded != 0 {
		t.Fatalf("upserted=0 must fail without fingerprinting, uploaded=%d err=%v", uploaded, err)
	}
	pending := scan.FilterUsageUploadDelta([]types.DailyUsage{{
		Date: "2026-07-19", ToolName: "codex", Model: "gpt", EstimatedCost: 5, Source: "local_scan",
	}}, time.Date(2026, 7, 21, 12, 0, 0, 0, time.UTC), cfg.OrgID, cfg.DeviceID)
	if len(pending) != 1 {
		t.Fatalf("row must remain pending, got %#v", pending)
	}
}

func TestReportLocalUsageDeltaPartialSuccessFingerprintsOnlyAccepted(t *testing.T) {
	cfg := setupCmdUsageHome(t)
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		n := calls.Add(1)
		var body struct {
			Aggregates []client.UsageAggregate `json:"aggregates"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		if n == 1 {
			_ = json.NewEncoder(w).Encode(map[string]any{"upserted": len(body.Aggregates)})
			return
		}
		http.Error(w, "timeout", http.StatusGatewayTimeout)
	}))
	defer server.Close()
	cfg.ControlPlaneURL = server.URL
	api := client.New(cfg)

	// Force two batches (size 50 → need >50 rows). Use unique models.
	rows := make([]client.UsageAggregate, 0, 60)
	for i := 0; i < 60; i++ {
		rows = append(rows, client.UsageAggregate{
			Date: "2026-07-19", ToolName: "codex", Model: fmt.Sprintf("m-%d", i),
			EstimatedCost: 1, InputTokens: 10, Source: "local_scan",
		})
	}
	uploaded, remaining, err := reportLocalUsageDelta(api, cfg, rows, nil)
	if err == nil {
		t.Fatal("expected partial failure error")
	}
	if uploaded == 0 || uploaded == 60 {
		t.Fatalf("expected partial upload, got uploaded=%d remaining=%d", uploaded, remaining)
	}
	// Accepted batch fingerprinted; failed batch must still be pending.
	now := time.Date(2026, 7, 21, 12, 0, 0, 0, time.UTC)
	usageRows := make([]types.DailyUsage, 0, len(rows))
	for _, row := range rows {
		usageRows = append(usageRows, aggregateToUsage(row))
	}
	pending := scan.FilterUsageUploadDelta(usageRows, now, cfg.OrgID, cfg.DeviceID)
	if len(pending) != 60-uploaded {
		t.Fatalf("pending=%d want %d (failed batch only)", len(pending), 60-uploaded)
	}
}

func TestReportLocalUsageDeltaReenrollReuploadsAfterServerWipe(t *testing.T) {
	cfg := setupCmdUsageHome(t)
	var mu sync.Mutex
	store := map[string]float64{}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Aggregates []client.UsageAggregate `json:"aggregates"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		mu.Lock()
		for _, row := range body.Aggregates {
			key := fmt.Sprintf("%s|%s|%s|%s", row.ToolName, row.Date, row.Model, row.Source)
			store[key] = row.EstimatedCost
		}
		n := len(body.Aggregates)
		mu.Unlock()
		_ = json.NewEncoder(w).Encode(map[string]any{"upserted": n})
	}))
	defer server.Close()
	cfg.ControlPlaneURL = server.URL
	api := client.New(cfg)

	row := client.UsageAggregate{
		Date: "2026-07-20", ToolName: "cursor", Model: "composer-2.5",
		EstimatedCost: 2.87, InputTokens: 100, Source: "cursor_usage_events",
	}
	if _, _, err := reportLocalUsageDelta(api, cfg, []client.UsageAggregate{row}, nil); err != nil {
		t.Fatal(err)
	}

	// Simulate revoke: server cascade-deletes usage; agent re-enrolls new device.
	mu.Lock()
	store = map[string]float64{}
	mu.Unlock()
	cfg.DeviceID = "device-2"
	cfg.OrgID = "org-2"
	_ = scan.ClearUsageUploadStore()

	uploaded, _, err := reportLocalUsageDelta(api, cfg, []client.UsageAggregate{row}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if uploaded != 1 {
		t.Fatalf("re-enroll must re-upload wiped history, uploaded=%d", uploaded)
	}
	mu.Lock()
	defer mu.Unlock()
	if store["cursor|2026-07-20|composer-2.5|cursor_usage_events"] != 2.87 {
		t.Fatalf("server missing restored row: %#v", store)
	}
}
