package cmd

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/spf13/cobra"
	"github.com/usejunction/agent/internal/config"
	"github.com/usejunction/agent/internal/configure"
)

var uninstallCmd = &cobra.Command{
	Use:   "uninstall",
	Short: "Unconfigure tools and remove agent data",
	RunE: func(cmd *cobra.Command, args []string) error {
		_ = configure.UnconfigureAll()
		dir := config.ConfigDir()
		_ = os.RemoveAll(dir)
		// Remove launchd plist if present
		home, _ := os.UserHomeDir()
		plist := filepath.Join(home, "Library", "LaunchAgents", "com.usejunction.agent.plist")
		_ = os.Remove(plist)
		fmt.Println("UseJunction agent uninstalled.")
		return nil
	},
}

func init() {
	rootCmd.AddCommand(uninstallCmd)
}
