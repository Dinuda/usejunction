package cmd

import (
	"context"
	"fmt"

	"github.com/spf13/cobra"
	"github.com/usejunction/agent/internal/providers"
)

var probeTool string

var probeCmd = &cobra.Command{
	Use:    "probe",
	Short:  "Probe quota and account identity for detected tools",
	Hidden: true,
	RunE: func(cmd *cobra.Command, args []string) error {
		ctx := context.Background()
		type result struct {
			Tool    string `json:"tool"`
			Account any    `json:"account"`
			Quotas  any    `json:"quotas"`
		}
		var out []result

		for _, p := range providers.All() {
			if probeTool != "" && p.ID() != probeTool {
				continue
			}
			acc, _ := p.AccountIdentity(ctx)
			quotas, _ := p.ProbeQuota(ctx)
			out = append(out, result{Tool: p.ID(), Account: acc, Quotas: quotas})
		}

		if format == "json" {
			printJSON(out)
			return nil
		}

		for _, item := range out {
			fmt.Printf("=== %s ===\n", item.Tool)
			fmt.Printf("  account: %+v\n", item.Account)
			fmt.Printf("  quotas:  %+v\n", item.Quotas)
		}
		return nil
	},
}

func init() {
	probeCmd.Flags().StringVar(&probeTool, "tool", "", "Probe a specific tool (codex|claude|cursor|copilot|opencode)")
	rootCmd.AddCommand(probeCmd)
}
