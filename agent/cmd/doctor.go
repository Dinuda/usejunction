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
	Short: "Detect AI coding tools and report configuration health",
	RunE: func(cmd *cobra.Command, args []string) error {
		ctx := context.Background()

		var detected []types.ToolStatus
		var notFound []types.ToolStatus

		for _, p := range providers.All() {
			status, err := p.Detect(ctx)
			if err != nil {
				continue
			}
			if status.Detected {
				detected = append(detected, *status)
			} else {
				notFound = append(notFound, *status)
			}
		}

		if format == "json" {
			all := append(detected, notFound...)
			printJSON(all)
			return nil
		}

		fmt.Printf("%-14s  %-10s  %-14s  %s\n", "TOOL", "DETECTED", "CONFIGURED", "CONFIG PATH")
		fmt.Printf("%-14s  %-10s  %-14s  %s\n", "----", "--------", "----------", "-----------")

		for _, r := range detected {
			configured := "no"
			if r.Configured {
				configured = "yes"
			}
			fmt.Printf("%-14s  %-10s  %-14s  %s\n", r.ToolName, "yes", configured, r.ConfigPath)
		}

		fmt.Printf("\n%d tool(s) detected.\n", len(detected))
		return nil
	},
}

func init() {
	rootCmd.AddCommand(doctorCmd)
}
