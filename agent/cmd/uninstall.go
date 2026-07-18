package cmd

import (
	"github.com/spf13/cobra"
	"github.com/usejunction/agent/internal/uninstall"
)

var uninstallCmd = &cobra.Command{
	Use:   "uninstall",
	Short: "Restore tool configs, remove agent data, and stop background services",
	RunE: func(cmd *cobra.Command, args []string) error {
		return uninstall.Run(verbose)
	},
}

func init() {
	rootCmd.AddCommand(uninstallCmd)
}
