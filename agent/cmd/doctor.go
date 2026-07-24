package cmd

import (
	"context"

	"github.com/spf13/cobra"
	"github.com/usejunction/agent/internal/providers"
	"github.com/usejunction/agent/internal/types"
	"github.com/usejunction/agent/internal/ui"
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

		ui.SetNoColor(noColor)
		ui.DoctorTable(detected)
		return nil
	},
}

func init() {
	rootCmd.AddCommand(doctorCmd)
}
