package cmd

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/spf13/cobra"
	"github.com/usejunction/agent/internal/client"
	"github.com/usejunction/agent/internal/config"
	"github.com/usejunction/agent/internal/providers"
	"github.com/usejunction/agent/internal/scan"
	"github.com/usejunction/agent/internal/types"
)

var (
	costTool    string
	costRefresh bool
)

func usageToAggregate(u types.DailyUsage) client.UsageAggregate {
	var repository *client.RepositoryReport
	if u.Repository != nil {
		repository = &client.RepositoryReport{Host: u.Repository.Host, Owner: u.Repository.Owner, Name: u.Repository.Name}
	}
	return client.UsageAggregate{
		Date:               u.Date,
		ToolName:           u.ToolName,
		Model:              u.Model,
		InputTokens:        u.InputTokens,
		OutputTokens:       u.OutputTokens,
		CacheReadTokens:    u.CacheReadTokens,
		CacheWriteTokens:   u.CacheWriteTokens,
		ReasoningTokens:    u.ReasoningTokens,
		EstimatedCost:      u.EstimatedCost,
		SuggestedLines:     u.SuggestedLines,
		AcceptedLines:      u.AcceptedLines,
		AddedLines:         u.AddedLines,
		DeletedLines:       u.DeletedLines,
		Commits:            u.Commits,
		AiPercent:          u.AiPercent,
		Requests:           u.Requests,
		Source:             u.Source,
		Verified:           u.Verified,
		MetricKind:         string(u.MetricKind),
		CostKind:           string(u.CostKind),
		TokenSemantics:     string(u.TokenSemantics),
		CalculationVersion: u.CalculationVersion,
		Repository:         repository,
		Metadata:           u.Metadata,
	}
}

func aggregateToUsage(u client.UsageAggregate) types.DailyUsage {
	var repository *types.RepositoryIdentity
	if u.Repository != nil {
		repository = &types.RepositoryIdentity{Host: u.Repository.Host, Owner: u.Repository.Owner, Name: u.Repository.Name}
	}
	return types.DailyUsage{
		Date:               u.Date,
		ToolName:           u.ToolName,
		Model:              u.Model,
		InputTokens:        u.InputTokens,
		OutputTokens:       u.OutputTokens,
		CacheReadTokens:    u.CacheReadTokens,
		CacheWriteTokens:   u.CacheWriteTokens,
		ReasoningTokens:    u.ReasoningTokens,
		EstimatedCost:      u.EstimatedCost,
		SuggestedLines:     u.SuggestedLines,
		AcceptedLines:      u.AcceptedLines,
		AddedLines:         u.AddedLines,
		DeletedLines:       u.DeletedLines,
		Commits:            u.Commits,
		AiPercent:          u.AiPercent,
		Requests:           u.Requests,
		Source:             u.Source,
		Verified:           u.Verified,
		MetricKind:         types.MetricKind(u.MetricKind),
		CostKind:           types.CostKind(u.CostKind),
		TokenSemantics:     types.TokenSemantics(u.TokenSemantics),
		CalculationVersion: u.CalculationVersion,
		Repository:         repository,
		Metadata:           u.Metadata,
	}
}

var costCmd = &cobra.Command{
	Use:   "cost",
	Short: "Scan local tool storage for token usage and estimated cost",
	Long: `cost reads local usage metadata written by AI coding tools
(Codex/Claude JSONL sessions, Cursor/Copilot sqlite DBs, Cline/Roo/OpenCode
extension task JSON, Continue history), aggregates by date and model, and
prints an estimated cost.

Only numeric usage metadata is read — prompt text is never accessed.
Scan results are cached under ~/.usejunction/cache/cost-usage/ unless
--refresh is set. When enrolled, uploads use the same delta filter as the
daemon (today UTC always, unchanged historical rows skipped).`,
	RunE: func(cmd *cobra.Command, args []string) error {
		ctx := context.Background()
		var all []types.DailyUsage

		for _, p := range providers.All() {
			if costTool != "" && costTool != "all" && p.ID() != costTool {
				continue
			}
			usage, err := p.ScanLocalUsage(ctx, costRefresh)
			if err != nil || len(usage) == 0 {
				continue
			}
			all = append(all, usage...)
		}

		if cfg, err := config.Load(); err == nil && len(all) > 0 {
			api := client.New(cfg)
			aggs := make([]client.UsageAggregate, 0, len(all))
			for _, u := range all {
				aggs = append(aggs, usageToAggregate(u))
			}
			_, _, _ = reportLocalUsageDelta(api, cfg, aggs, nil)
		}

		if format == "json" {
			printJSON(all)
			return nil
		}

		if len(all) == 0 {
			fmt.Println("No local usage metadata found.")
			return nil
		}

		fmt.Printf("%-12s  %-10s  %-22s  %8s  %8s  %8s  %8s  %10s  %s\n",
			"DATE", "TOOL", "MODEL", "INPUT", "OUTPUT", "CACHE_R", "CACHE_W", "COST ($)", "SOURCE")
		fmt.Printf("%-12s  %-10s  %-22s  %8s  %8s  %8s  %8s  %10s  %s\n",
			"----", "----", "-----", "-----", "------", "-------", "-------", "--------", "------")

		var total float64
		for _, u := range all {
			fmt.Printf("%-12s  %-10s  %-22s  %8d  %8d  %8d  %8d  %10.4f  %s\n",
				u.Date, u.ToolName, truncate(u.Model, 22),
				u.InputTokens, u.OutputTokens, u.CacheReadTokens, u.CacheWriteTokens,
				u.EstimatedCost, u.Source)
			total += u.EstimatedCost
		}
		fmt.Printf("\nTotal estimated cost: $%.4f\n", total)
		return nil
	},
}

// reportLocalUsageDelta drains a bounded slice of the pending usage queue.
// History older than scan.UsageLookbackDays is dropped. Batches within the
// sync budget are uploaded concurrently (UsageUploadConcurrency). Each
// successful batch is fingerprinted for this enrollment only so later syncs
// continue the queue without re-uploading accepted rows. Failed POSTs
// (413/4xx/5xx/timeout) never fingerprint. Leftover rows after the budget are
// not an error.
func reportLocalUsageDelta(api *client.APIClient, cfg *config.Config, rows []client.UsageAggregate, beforeUpload func(drain, pending, scanned int)) (uploaded int, remaining int, err error) {
	if len(rows) == 0 {
		return 0, 0, nil
	}
	orgID, deviceID := "", ""
	if cfg != nil {
		orgID, deviceID = cfg.OrgID, cfg.DeviceID
	}
	usageRows := make([]types.DailyUsage, 0, len(rows))
	for _, row := range rows {
		usageRows = append(usageRows, aggregateToUsage(row))
	}
	pending := scan.FilterUsageUploadDelta(usageRows, time.Now().UTC(), orgID, deviceID)
	if len(pending) == 0 {
		return 0, 0, nil
	}
	drain, leftover := scan.TakeUsageUploadBatch(pending, scan.UsageUploadBatchSize, scan.UsageUploadMaxBatchesPerSync)
	if beforeUpload != nil {
		beforeUpload(len(drain), len(pending), len(rows))
	}

	batches := scan.SplitUsageUploadBatches(drain, scan.UsageUploadBatchSize)
	type batchResult struct {
		rows []types.DailyUsage
		err  error
	}
	results := make(chan batchResult, len(batches))
	sem := make(chan struct{}, scan.UsageUploadConcurrency)
	var wg sync.WaitGroup
	for _, batch := range batches {
		batch := batch
		wg.Add(1)
		go func() {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()

			reports := make([]client.UsageAggregate, 0, len(batch))
			for _, row := range batch {
				reports = append(reports, usageToAggregate(row))
			}
			if err := api.ReportLocalUsage(reports); err != nil {
				results <- batchResult{err: err}
				return
			}
			results <- batchResult{rows: batch}
		}()
	}
	wg.Wait()
	close(results)

	accepted := make([]types.DailyUsage, 0, len(drain))
	var firstErr error
	for result := range results {
		if result.err != nil {
			if firstErr == nil {
				firstErr = result.err
			}
			continue
		}
		accepted = append(accepted, result.rows...)
	}
	if len(accepted) > 0 {
		if rememberErr := scan.RememberUsageUpload(accepted, orgID, deviceID); rememberErr != nil && firstErr == nil {
			firstErr = rememberErr
		}
	}
	uploaded = len(accepted)
	remaining = len(leftover) + (len(drain) - uploaded)
	return uploaded, remaining, firstErr
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n-1] + "…"
}

func init() {
	costCmd.Flags().StringVar(&costTool, "tool", "all", "Tool to scan: codex|claude|cursor|copilot|continue|cline|roo|opencode|all")
	costCmd.Flags().BoolVar(&costRefresh, "refresh", false, "Re-scan even if cache is fresh")
	rootCmd.AddCommand(costCmd)
}
