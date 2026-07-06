package cmd

import (
	"context"
	"fmt"

	"github.com/spf13/cobra"
	"github.com/usejunction/agent/internal/providers"
	"github.com/usejunction/agent/internal/types"
)

var doctorCmd = &cobra.Command{
	Use:   "doctor",
	Short: "Check detected tools and configuration health",
	RunE: func(cmd *cobra.Command, args []string) error {
		ctx := context.Background()
		var results []types.ToolStatus
		for _, p := range providers.All() {
			status, err := p.Detect(ctx)
			if err != nil {
				continue
			}
			if status.Detected {
				results = append(results, *status)
			}
		}
		if format == "json" {
			printJSON(results)
			return nil
		}
		fmt.Println("Tool detection results:")
		fmt.Printf("%-12s %-10s %-12s %s\n", "TOOL", "DETECTED", "CONFIGURED", "CONFIG PATH")
		for _, r := range results {
			fmt.Printf("%-12s %-10v %-12v %s\n", r.ToolName, r.Detected, r.Configured, r.ConfigPath)
		}
		if len(results) == 0 {
			fmt.Println("No AI coding tools detected.")
		}
		return nil
	},
}

func init() {
	rootCmd.AddCommand(doctorCmd)
}
