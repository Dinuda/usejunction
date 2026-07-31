package cmd

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/usejunction/agent/internal/client"
	"github.com/usejunction/agent/internal/config"
	"github.com/usejunction/agent/internal/probe"
	"github.com/usejunction/agent/internal/providers"
	"github.com/usejunction/agent/internal/scan"
	"github.com/usejunction/agent/internal/syncengine"
	"github.com/usejunction/agent/internal/types"
	"github.com/usejunction/agent/internal/workextract"
)

const (
	providerCollectTimeout = 45 * time.Second
	// providerCollectConcurrency caps how many providers scan at once.
	providerCollectConcurrency = 6
)

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

func claudeConfigDirForProbe() string {
	if d := os.Getenv("CLAUDE_CONFIG_DIR"); d != "" {
		return d
	}
	home, _ := os.UserHomeDir()
	candidate := filepath.Join(home, ".claude")
	if st, err := os.Stat(candidate); err == nil && st.IsDir() {
		return candidate
	}
	return filepath.Join(home, ".config", "claude")
}

// collectAndReport gathers telemetry from all providers and posts to the control plane.
// When refresh is false, providers use incremental scan snapshots unless the
// control plane sealed a newer fullUsageRescanDay.
func collectAndReport(api *client.APIClient, refresh bool) (tools int, accounts int, quotas int, usage int, err error) {
	tools, accounts, quotas, usage, _, _, err = collectAndReportWithTools(context.Background(), api, refresh, func(string, string) {})
	return tools, accounts, quotas, usage, err
}

func collectAndReportWithProgress(
	ctx context.Context,
	api *client.APIClient,
	refresh bool,
	progress collectProgress,
) (tools int, accounts int, quotas int, usage int, warnings []string, err error) {
	tools, accounts, quotas, usage, _, warnings, err = collectAndReportWithTools(ctx, api, refresh, progress)
	return tools, accounts, quotas, usage, warnings, err
}

func collectAndReportWithTools(
	ctx context.Context,
	api *client.APIClient,
	refresh bool,
	progress collectProgress,
) (tools int, accounts int, quotas int, usage int, toolList []types.ToolStatus, warnings []string, err error) {
	if progress == nil {
		progress = func(string, string) {}
	}

	progress("heartbeat", "Registering local agent")
	hb, err := heartbeat(api)
	if err != nil {
		return 0, 0, 0, 0, nil, warnings, fmt.Errorf("heartbeat: %w", err)
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

	allProviders := providers.All()
	progress("scan", fmt.Sprintf("Scanning %d tools in parallel", len(allProviders)))

	type providerOutcome struct {
		id       string
		result   providerCollectResult
		timedOut bool
	}
	outcomes := make([]providerOutcome, len(allProviders))
	sem := make(chan struct{}, providerCollectConcurrency)
	var wg sync.WaitGroup
	for i, p := range allProviders {
		wg.Add(1)
		go func(idx int, prov providers.Provider) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()
			id := prov.ID()
			if ctx.Err() != nil {
				outcomes[idx] = providerOutcome{id: id, timedOut: true}
				progress("scan-tool-skip", id)
				return
			}
			progress("scan-tool-start", id)
			result, timedOut := collectProviderWithTimeout(ctx, prov, forceFull)
			outcomes[idx] = providerOutcome{id: id, result: result, timedOut: timedOut}
			if timedOut {
				progress("scan-tool-skip", id)
				return
			}
			progress("scan-tool-done", id)
		}(i, p)
	}
	wg.Wait()

	for _, out := range outcomes {
		if out.timedOut {
			warnings = append(warnings, fmt.Sprintf("%s scan timed out", out.id))
			continue
		}
		toolReports = append(toolReports, out.result.toolReports...)
		accountReports = append(accountReports, out.result.accountReports...)
		modelReports = append(modelReports, out.result.modelReports...)
		usageReports = append(usageReports, out.result.usageReports...)
		quotaReports = append(quotaReports, out.result.quotaReports...)
	}

	progress("upload-tools", fmt.Sprintf("Preparing %d tool / %d account / %d quota reports for sync", len(toolReports), len(accountReports), len(quotaReports)))
	if len(modelReports) > 0 {
		progress("upload-models", fmt.Sprintf("Uploading %d local model reports", len(modelReports)))
		if err := api.ReportLocalModels(modelReports); err != nil && verbose {
			fmt.Printf("[report] models: %v\n", err)
		}
	}
	usageIncomplete := false
	var uploadErr error
	uploaded := 0
	// Tools/accounts/quotas ride as sidecars on usage sync start. If there is no
	// usage or detected inventory, still open a sync session. Empty authoritative
	// sidecars are the server-visible checkpoint that the first scan completed.
	{
		daily := make([]types.DailyUsage, 0, len(usageReports))
		for _, row := range usageReports {
			daily = append(daily, aggregateToUsage(row))
		}
		progress("upload-usage", fmt.Sprintf("Syncing usage (%d scanned rows, last %d days) + inventory", len(daily), scan.UsageLookbackDays))
		// Drain until remaining==0 so first-sync dashboards are correct in one collect.
		// Each iteration re-starts; fingerprints from prior chunks shrink the delta.
		// Inventory sidecars are sent on the first pass; server no-ops on hash match.
		const maxUsageSyncIterations = 32
		remaining := 0
		maxChunks := scan.UsageUploadMaxBatchesPerSync
		if forceFull {
			maxChunks = scan.UsageUploadMaxBatchesPerSyncFirst
		}
		for iter := 0; iter < maxUsageSyncIterations; iter++ {
			if err := ctx.Err(); err != nil {
				uploadErr = err
				break
			}
			var inventory *syncengine.InventorySidecars
			if iter == 0 {
				toolsForPass := toolReports
				if toolsForPass == nil {
					toolsForPass = []client.ToolReport{}
				}
				accountsForPass := accountReports
				if accountsForPass == nil {
					accountsForPass = []client.AccountReport{}
				}
				quotasForPass := quotaReports
				if quotasForPass == nil {
					quotasForPass = []client.QuotaReport{}
				}
				inventory = &syncengine.InventorySidecars{
					Tools:    toolsForPass,
					Accounts: accountsForPass,
					Quotas:   quotasForPass,
				}
			}
			n, rem, syncWarnings, err := syncengine.UploadUsageSession(ctx, api, daily, inventory, syncengine.UploadOptions{
				MaxChunks: maxChunks,
				Progress: func(done, total int) {
					progress("upload-usage", fmt.Sprintf("Uploaded %d of %d usage rows this pass", done, total))
				},
			})
			warnings = append(warnings, syncWarnings...)
			uploaded += n
			remaining = rem
			uploadErr = err
			if uploadErr != nil {
				progress("upload-usage", fmt.Sprintf("Usage sync failed: %v", uploadErr))
				break
			}
			if remaining == 0 {
				break
			}
			progress("upload-usage", fmt.Sprintf("Uploaded %d usage rows so far; continuing (%d remaining)", uploaded, remaining))
		}
		if remaining > 0 && uploadErr == nil {
			warnings = append(warnings, fmt.Sprintf("%d usage rows still queued after %d sync passes", remaining, maxUsageSyncIterations))
		}
		switch {
		case uploaded == 0 && remaining == 0 && uploadErr == nil:
			progress("upload-usage", "No usage changes since last upload")
		case remaining > 0:
			progress("upload-usage", fmt.Sprintf("Uploaded %d usage rows; %d older rows queued for next sync", uploaded, remaining))
			warnings = append(warnings, fmt.Sprintf("%d usage rows still queued for upload", remaining))
		case uploadErr != nil:
			progress("upload-usage", fmt.Sprintf("Uploaded %d usage rows before error", uploaded))
		default:
			progress("upload-usage", fmt.Sprintf("Uploaded %d usage rows", uploaded))
		}
		if uploadErr != nil {
			warnings = append(warnings, fmt.Sprintf("usage upload interrupted: %v", uploadErr))
			if verbose {
				fmt.Printf("[report] usage upload: %v\n", uploadErr)
			}
		}
		if remaining > 0 || uploadErr != nil {
			usageIncomplete = true
		}
	}

	progress("work-extract", "Checking work extraction policy")
	if workErr := maybeReportWorkSessions(api, progress); workErr != nil && verbose {
		fmt.Printf("[report] work extraction: %v\n", workErr)
	}

	if !usageIncomplete && forceFull && sealedDay != "" && sealedDay > lastFullDay && cfgErr == nil && cfg != nil {
		cfg.LastFullUsageRescanDay = sealedDay
		if saveErr := config.Save(cfg); saveErr != nil {
			warnings = append(warnings, fmt.Sprintf("persist lastFullUsageRescanDay: %v", saveErr))
		}
	}

	toolList = make([]types.ToolStatus, 0, len(toolReports))
	for _, tr := range toolReports {
		toolList = append(toolList, types.ToolStatus{
			ToolName:   tr.ToolName,
			Detected:   tr.Detected,
			Configured: tr.Configured,
			ConfigPath: tr.ConfigPath,
			Version:    tr.Version,
		})
	}

	if uploadErr != nil && uploaded == 0 {
		progress("complete", "Sync failed")
		return len(toolReports), len(accountReports), len(quotaReports), len(usageReports), toolList, warnings, fmt.Errorf("usage: %w", uploadErr)
	}
	if cfgErr == nil {
		markCollectCompleted(cfg)
	}
	if usageIncomplete {
		progress("complete", "Sync complete with usage still queued")
		return len(toolReports), len(accountReports), len(quotaReports), len(usageReports), toolList, warnings, errUsageQueuePending
	}
	progress("complete", "Sync complete")
	return len(toolReports), len(accountReports), len(quotaReports), len(usageReports), toolList, warnings, nil
}

func markCollectCompleted(cfg *config.Config) {
	if cfg == nil {
		return
	}
	cfg.LastCollectCompletedAt = time.Now().UTC().Format(time.RFC3339Nano)
	if err := config.Save(cfg); err != nil && verbose {
		fmt.Printf("[report] persist lastCollectCompletedAt: %v\n", err)
	}
}

func shouldSkipInitialDaemonCollect(cfg *config.Config) bool {
	if cfg == nil || strings.TrimSpace(cfg.LastCollectCompletedAt) == "" {
		return false
	}
	completedAt, err := time.Parse(time.RFC3339Nano, cfg.LastCollectCompletedAt)
	if err != nil {
		return false
	}
	return time.Since(completedAt) < 10*time.Minute
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

	// Scan usage before quota HTTP so upload can start sooner after all providers finish.
	if daily, scanErr := p.ScanLocalUsage(ctx, refresh); scanErr == nil {
		for _, row := range daily {
			result.usageReports = append(result.usageReports, usageToAggregate(row))
		}
	}

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
	case "claude":
		// Merge plan/auth from quota probe even when HTTP fails (401 clears plan).
		snaps, probeAcc, err := probe.ProbeClaudeQuota(ctx, claudeConfigDirForProbe())
		acc = mergeToolAccounts(acc, probeAcc)
		if err == nil {
			quotaSnaps = snaps
		}
	default:
		quotaSnaps, _ = p.ProbeQuota(ctx)
	}
	plan := ""
	if acc != nil {
		plan = strings.TrimSpace(acc.Plan)
	}
	// Attach when auth is present or a vendor plan was probed — syncDetected
	// creates seats from a non-empty plan, or auth + catalog default plan.
	if acc != nil && (acc.AuthPresent || plan != "") {
		toolName := strings.TrimSpace(acc.ToolName)
		if toolName == "" {
			toolName = status.ToolName
		}
		result.accountReports = append(result.accountReports, client.AccountReport{
			ToolName:    toolName,
			Email:       acc.Email,
			Plan:        plan,
			LoginMethod: acc.LoginMethod,
			AuthPresent: acc.AuthPresent || plan != "",
		})
		if plan == "" && len(quotaSnaps) > 0 {
			fmt.Printf("[collect] %s: auth/quota present but plan empty — seat sync will use catalog default when available\n", toolName)
		}
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
