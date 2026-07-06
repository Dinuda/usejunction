package cmd

import (
	"context"
	"fmt"

	"github.com/spf13/cobra"
	"github.com/usejunction/agent/internal/providers"
)

var probeTool string

var probeCmd = &cobra.Command{
	Use:   "probe",
	Short: "Probe quota and account identity for tools",
	RunE: func(cmd *cobra.Command, args []string) error {
		ctx := context.Background()
		var out []map[string]any
		for _, p := range providers.All() {
			if probeTool != "" && p.ID() != probeTool {
				continue
			}
			acc, _ := p.AccountIdentity(ctx)
			quotas, _ := p.ProbeQuota(ctx)
			out = append(out, map[string]any{
				"tool":    p.ID(),
				"account": acc,
				"quotas":  quotas,
			})
		}
		if format == "json" {
			printJSON(out)
			return nil
		}
		for _, item := range out {
			fmt.Printf("=== %s ===\n", item["tool"])
			fmt.Printf("%v\n", item["account"])
			fmt.Printf("%v\n", item["quotas"])
		}
		return nil
	},
}

func init() {
	probeCmd.Flags().StringVar(&probeTool, "tool", "", "Probe specific tool (codex|claude)")
	rootCmd.AddCommand(probeCmd)
}
