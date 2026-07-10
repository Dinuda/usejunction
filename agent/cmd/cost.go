package cmd

import (
	"context"
	"fmt"

	"github.com/spf13/cobra"
	"github.com/usejunction/agent/internal/client"
	"github.com/usejunction/agent/internal/config"
	"github.com/usejunction/agent/internal/providers"
	"github.com/usejunction/agent/internal/types"
)

var (
	costTool    string
	costRefresh bool
)

var costCmd = &cobra.Command{
	Use:   "cost",
	Short: "Scan local session logs for token usage and estimated cost",
	Long: `cost reads local JSONL session files written by Codex and Claude Code,
aggregates token counts by date and model, and prints an estimated cost.

Only numeric usage metadata is read — prompt text is never accessed.
Results are cached in ~/.usejunction/cache/cost-usage/ unless --refresh is set.`,
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

		// Best-effort upload when enrolled.
		if cfg, err := config.Load(); err == nil && len(all) > 0 {
			api := client.New(cfg)
			var aggs []client.UsageAggregate
			for _, u := range all {
				aggs = append(aggs, client.UsageAggregate{
					Date:            u.Date,
					ToolName:        u.ToolName,
					Model:           u.Model,
					InputTokens:     u.InputTokens,
					OutputTokens:    u.OutputTokens,
					CacheReadTokens: u.CacheReadTokens,
					EstimatedCost:   u.EstimatedCost,
				})
			}
			_ = api.ReportLocalUsage(aggs)
		}

		if format == "json" {
			printJSON(all)
			return nil
		}

		if len(all) == 0 {
			fmt.Println("No local session logs found.")
			return nil
		}

		fmt.Printf("%-12s  %-12s  %-24s  %10s  %10s  %10s\n",
			"DATE", "TOOL", "MODEL", "INPUT", "OUTPUT", "COST ($)")
		fmt.Printf("%-12s  %-12s  %-24s  %10s  %10s  %10s\n",
			"----", "----", "-----", "-----", "------", "--------")

		var total float64
		for _, u := range all {
			fmt.Printf("%-12s  %-12s  %-24s  %10d  %10d  %10.4f\n",
				u.Date, u.ToolName, u.Model,
				u.InputTokens, u.OutputTokens, u.EstimatedCost)
			total += u.EstimatedCost
		}
		fmt.Printf("\nTotal estimated cost: $%.4f\n", total)
		return nil
	},
}

func init() {
	costCmd.Flags().StringVar(&costTool, "tool", "all", "Tool to scan: codex|claude|all")
	costCmd.Flags().BoolVar(&costRefresh, "refresh", false, "Re-scan even if cache is fresh")
	rootCmd.AddCommand(costCmd)
}
