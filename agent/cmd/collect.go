package cmd

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/usejunction/agent/internal/client"
	"github.com/usejunction/agent/internal/config"
	"github.com/usejunction/agent/internal/probe"
	"github.com/usejunction/agent/internal/providers"
	"github.com/usejunction/agent/internal/scan"
	"github.com/usejunction/agent/internal/types"
	"github.com/usejunction/agent/internal/workextract"
)

const providerCollectTimeout = 45 * time.Second

type collectProgress = func(step, message string)

type providerCollectResult struct {
	toolReports    []client.ToolReport
	accountReports []client.AccountReport
	modelReports   []client.LocalModelReport
	usageReports   []client.UsageAggregate
	quotaReports   []client.QuotaReport
}

func mergeToolAccounts(base, richer *types.ToolAccount) *types.ToolAccount {
	if base == nil && richer == nil {
		return nil
	}
	if base == nil {
		return richer
	}
	if richer == nil {
		return base
	}
	out := *base
	if strings.TrimSpace(out.Email) == "" {
		out.Email = richer.Email
	}
	if strings.TrimSpace(out.Plan) == "" {
		out.Plan = richer.Plan
	}
	if richer.AuthPresent {
		out.AuthPresent = true
	}
	return &out
}

func codexHomeForProbe() string {
	if h := os.Getenv("CODEX_HOME"); h != "" {
		return h
	}
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".codex")
}

// collectAndReport gathers telemetry from all providers and posts to the control plane.
// When refresh is false, providers use incremental scan snapshots unless the
// control plane sealed a newer fullUsageRescanDay.
func collectAndReport(api *client.APIClient, refresh bool) (tools int, accounts int, quotas int, usage int, err error) {
	tools, accounts, quotas, usage, _, err = collectAndReportWithProgress(context.Background(), api, refresh, func(string, string) {})
	return tools, accounts, quotas, usage, err
}

func collectAndReportWithProgress(
	ctx context.Context,
	api *client.APIClient,
	refresh bool,
	progress collectProgress,
) (tools int, accounts int, quotas int, usage int, warnings []string, err error) {
	if progress == nil {
		progress = func(string, string) {}
	}

	progress("heartbeat", "Registering local agent")
	hb, err := heartbeat(api)
	if err != nil {
		return 0, 0, 0, 0, warnings, fmt.Errorf("heartbeat: %w", err)
	}

	forceFull := refresh
	sealedDay := strings.TrimSpace(hb.FullUsageRescanDay)
	cfg, cfgErr := config.Load()
	lastFullDay := ""
	if cfgErr == nil && cfg != nil {
		lastFullDay = strings.TrimSpace(cfg.LastFullUsageRescanDay)
	}
	if shouldForceFullUsageRescan(refresh, sealedDay, lastFullDay) {
		forceFull = true
		if !refresh && sealedDay != "" {
			progress("scan", fmt.Sprintf("Full usage rescan for sealed day %s", sealedDay))
		}
	}

	var toolReports []client.ToolReport
	var accountReports []client.AccountReport
	var modelReports []client.LocalModelReport
	var usageReports []client.UsageAggregate
	var quotaReports []client.QuotaReport

	for _, p := range providers.All() {
		progress("scan", fmt.Sprintf("Scanning %s", p.ID()))
		result, timedOut := collectProviderWithTimeout(ctx, p, forceFull)
		if timedOut {
			warnings = append(warnings, fmt.Sprintf("%s scan timed out", p.ID()))
			progress("scan", fmt.Sprintf("Skipped slow %s scan", p.ID()))
			continue
		}
		toolReports = append(toolReports, result.toolReports...)
		accountReports = append(accountReports, result.accountReports...)
		modelReports = append(modelReports, result.modelReports...)
		usageReports = append(usageReports, result.usageReports...)
		quotaReports = append(quotaReports, result.quotaReports...)
	}

	progress("upload-tools", fmt.Sprintf("Uploading %d tool reports", len(toolReports)))
	if err := api.ReportTools(toolReports); err != nil {
		return len(toolReports), len(accountReports), len(quotaReports), len(usageReports), warnings, fmt.Errorf("tools: %w", err)
	}
	if len(accountReports) > 0 {
		progress("upload-accounts", fmt.Sprintf("Uploading %d account reports", len(accountReports)))
		if err := api.ReportAccounts(accountReports); err != nil {
			return len(toolReports), len(accountReports), len(quotaReports), len(usageReports), warnings, fmt.Errorf("accounts: %w", err)
		}
	}
	if len(quotaReports) > 0 {
		progress("upload-quotas", fmt.Sprintf("Uploading %d quota windows", len(quotaReports)))
		if err := api.ReportQuotas(quotaReports); err != nil {
			return len(toolReports), len(accountReports), len(quotaReports), len(usageReports), warnings, fmt.Errorf("quotas: %w", err)
		}
	}
	if len(modelReports) > 0 {
		progress("upload-models", fmt.Sprintf("Uploading %d local model reports", len(modelReports)))
		if err := api.ReportLocalModels(modelReports); err != nil && verbose {
			fmt.Printf("[report] models: %v\n", err)
		}
	}
	if len(usageReports) > 0 {
		uploaded, remaining, uploadErr := reportLocalUsageDelta(api, usageReports, func(drain, pending, scanned int) {
			progress("upload-usage", fmt.Sprintf("Uploading %d of %d queued usage rows (scanned %d, last %d days)", drain, pending, scanned, scan.UsageLookbackDays))
		})
		if uploadErr != nil && uploaded == 0 {
			return len(toolReports), len(accountReports), len(quotaReports), len(usageReports), warnings, fmt.Errorf("usage: %w", uploadErr)
		}
		switch {
		case uploaded == 0:
			progress("upload-usage", "No usage changes since last upload")
		case remaining > 0:
			progress("upload-usage", fmt.Sprintf("Uploaded %d usage rows; %d older rows queued for next sync", uploaded, remaining))
			warnings = append(warnings, fmt.Sprintf("%d usage rows still queued for upload", remaining))
		default:
			progress("upload-usage", fmt.Sprintf("Uploaded %d usage rows", uploaded))
		}
		if uploadErr != nil {
			warnings = append(warnings, "usage upload interrupted; will retry remaining rows")
			if verbose {
				fmt.Printf("[report] usage upload: %v\n", uploadErr)
			}
		}
	}

	progress("work-extract", "Checking work extraction policy")
	if workErr := maybeReportWorkSessions(api, progress); workErr != nil && verbose {
		fmt.Printf("[report] work extraction: %v\n", workErr)
	}

	if forceFull && sealedDay != "" && sealedDay > lastFullDay && cfgErr == nil && cfg != nil {
		cfg.LastFullUsageRescanDay = sealedDay
		if saveErr := config.Save(cfg); saveErr != nil {
			warnings = append(warnings, fmt.Sprintf("persist lastFullUsageRescanDay: %v", saveErr))
		}
	}

	progress("complete", "Sync complete")
	return len(toolReports), len(accountReports), len(quotaReports), len(usageReports), warnings, nil
}

func maybeReportWorkSessions(api *client.APIClient, progress collectProgress) error {
	policy, err := api.SignalsPolicy()
	if err != nil {
		return err
	}
	if !policy.WorkExtractionEnabled {
		return nil
	}

	cfg, err := config.Load()
	if err != nil {
		return fmt.Errorf("load work extraction state: %w", err)
	}
	opts, stateChanged, err := forwardOnlyWorkOptions(policy.WorkExtractionStartedAt, cfg)
	if err != nil {
		return err
	}
	if stateChanged {
		if err := config.Save(cfg); err != nil {
			return fmt.Errorf("save work extraction epoch: %w", err)
		}
	}

	progress("work-extract", "Extracting work observed since Signals was enabled")
	sessions := workextract.Collect(opts)
	if len(sessions) == 0 {
		return nil
	}

	const batchSize = 200
	for start := 0; start < len(sessions); start += batchSize {
		end := start + batchSize
		if end > len(sessions) {
			end = len(sessions)
		}
		batch := sessions[start:end]
		progress("work-extract", fmt.Sprintf("Uploading work sessions %d–%d of %d", start+1, end, len(sessions)))
		if err := api.ReportWorkSessions(batch); err != nil {
			return err
		}
	}

	newest := opts.NotBefore
	for _, session := range sessions {
		observed, parseErr := time.Parse(time.RFC3339Nano, session.ObservedAt)
		if parseErr == nil && observed.After(newest) {
			newest = observed
		}
	}
	cfg.WorkExtractionLastAt = newest.UTC().Format(time.RFC3339Nano)
	cfg.SignalsWorkExtraction = true
	if err := config.Save(cfg); err != nil {
		return fmt.Errorf("save work extraction watermark: %w", err)
	}
	return nil
}

func forwardOnlyWorkOptions(policyStartedAt string, cfg *config.Config) (workextract.Options, bool, error) {
	cutoff, err := time.Parse(time.RFC3339Nano, policyStartedAt)
	if err != nil || cutoff.IsZero() {
		return workextract.Options{}, false, fmt.Errorf("work extraction policy missing valid collection start")
	}
	cutoff = cutoff.UTC()
	cutoffText := cutoff.Format(time.RFC3339Nano)
	opts := workextract.Options{NotBefore: cutoff}
	changed := false

	if cfg.WorkExtractionStartedAt != cutoffText {
		// A new enablement epoch always resets the incremental watermark to the
		// server boundary; it never authorizes a historical scan.
		cfg.WorkExtractionStartedAt = cutoffText
		cfg.WorkExtractionLastAt = ""
		changed = true
	} else if strings.TrimSpace(cfg.WorkExtractionLastAt) != "" {
		since, parseErr := time.Parse(time.RFC3339Nano, cfg.WorkExtractionLastAt)
		if parseErr != nil {
			// Corrupt local state is repaired to the safe policy epoch. NotBefore
			// remains mandatory, so no pre-enable session can be returned.
			cfg.WorkExtractionLastAt = ""
			changed = true
		} else {
			opts.Since = since.UTC()
		}
	}
	if !cfg.SignalsWorkExtraction {
		cfg.SignalsWorkExtraction = true
		changed = true
	}
	return opts, changed, nil
}

func collectProviderWithTimeout(ctx context.Context, p providers.Provider, refresh bool) (providerCollectResult, bool) {
	providerCtx, cancel := context.WithTimeout(ctx, providerCollectTimeout)
	defer cancel()
	ch := make(chan providerCollectResult, 1)
	go func() {
		ch <- collectProvider(providerCtx, p, refresh)
	}()
	select {
	case result := <-ch:
		return result, false
	case <-providerCtx.Done():
		return providerCollectResult{}, true
	}
}

func collectProvider(ctx context.Context, p providers.Provider, refresh bool) providerCollectResult {
	var result providerCollectResult
	status, _ := p.Detect(ctx)
	if status == nil || !status.Detected {
		return result
	}

	result.toolReports = append(result.toolReports, client.ToolReport{
		ToolName:   status.ToolName,
		Detected:   true,
		Configured: status.Configured,
		ConfigPath: status.ConfigPath,
		Version:    status.Version,
	})

	acc, _ := p.AccountIdentity(ctx)
	var quotaSnaps []types.QuotaSnapshot
	switch p.ID() {
	case "cursor":
		// Single probe — CursorProvider.ProbeQuota would call this again.
		if snaps, probeAcc, err := probe.ProbeCursorQuota(ctx); err == nil {
			quotaSnaps = snaps
			acc = mergeToolAccounts(acc, probeAcc)
		}
	case "codex":
		// Single probe — formerly accountFromProbe + ProbeQuota each called
		// ProbeCodexQuota and burned most of the collect timeout before scan.
		if snaps, probeAcc, err := probe.ProbeCodexQuota(ctx, codexHomeForProbe()); err == nil {
			quotaSnaps = snaps
			acc = mergeToolAccounts(acc, probeAcc)
		}
	default:
		quotaSnaps, _ = p.ProbeQuota(ctx)
	}
	if acc != nil && acc.AuthPresent {
		result.accountReports = append(result.accountReports, client.AccountReport{
			ToolName:    acc.ToolName,
			Email:       acc.Email,
			Plan:        acc.Plan,
			LoginMethod: acc.LoginMethod,
			AuthPresent: acc.AuthPresent,
		})
	}

	for _, snap := range quotaSnaps {
		result.quotaReports = append(result.quotaReports, client.QuotaReport{
			ToolName:         snap.ToolName,
			WindowType:       snap.WindowType,
			UsedPercent:      snap.UsedPercent,
			ResetAt:          snap.ResetAt,
			CreditsRemaining: snap.CreditsRemaining,
			Source:           snap.Source,
		})
	}

	if daily, scanErr := p.ScanLocalUsage(ctx, refresh); scanErr == nil {
		for _, row := range daily {
			result.usageReports = append(result.usageReports, usageToAggregate(row))
		}
	}

	if o, ok := p.(*providers.OllamaProvider); ok {
		if ms, localErr := o.LocalModels(ctx); localErr == nil {
			for _, m := range ms {
				result.modelReports = append(result.modelReports, client.LocalModelReport{
					Provider:  m.Provider,
					ModelName: m.ModelName,
					Size:      m.Size,
					Running:   m.Running,
				})
			}
		}
	}
	if l, ok := p.(*providers.LMStudioProvider); ok {
		if ms, localErr := l.LocalModels(ctx); localErr == nil {
			for _, m := range ms {
				result.modelReports = append(result.modelReports, client.LocalModelReport{
					Provider:  m.Provider,
					ModelName: m.ModelName,
					Running:   m.Running,
				})
			}
		}
	}
	return result
}

func shouldForceFullUsageRescan(refresh bool, sealedDay, lastFullDay string) bool {
	if refresh {
		return true
	}
	sealedDay = strings.TrimSpace(sealedDay)
	lastFullDay = strings.TrimSpace(lastFullDay)
	return sealedDay != "" && sealedDay > lastFullDay
}
