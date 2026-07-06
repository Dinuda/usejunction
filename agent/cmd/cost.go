package cmd

import (
	"context"
	"fmt"

	"github.com/spf13/cobra"
	"github.com/usejunction/agent/internal/client"
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
		cfg, _ := requireConfig()
		if cfg != nil {
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
		fmt.Printf("%-12s %-12s %-24s %10s %10s %10s\n", "DATE", "TOOL", "MODEL", "INPUT", "OUTPUT", "COST")
		var total float64
		for _, u := range all {
			fmt.Printf("%-12s %-12s %-24s %10d %10d %9.4f\n",
				u.Date, u.ToolName, u.Model, u.InputTokens, u.OutputTokens, u.EstimatedCost)
			total += u.EstimatedCost
		}
		fmt.Printf("\nTotal estimated cost: $%.4f\n", total)
		return nil
	},
}

func init() {
	costCmd.Flags().StringVar(&costTool, "tool", "all", "Tool to scan (codex|claude|all)")
	costCmd.Flags().BoolVar(&costRefresh, "refresh", false, "Ignore cache and re-scan")
	rootCmd.AddCommand(costCmd)
}
